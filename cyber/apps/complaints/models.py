import uuid
import datetime
from django.db import models
from apps.users.models import User, Organization

class Complaint(models.Model):
    FRAUD_METHODS = [
        ('UPI', 'UPI'),
        ('CARD', 'Card'),
        ('NET_BANKING', 'Net Banking'),
        ('PHONE_CALL', 'Phone Call'),
        ('EMAIL_PHISHING', 'Email Phishing'),
        ('OTHER', 'Other'),
    ]

    STATUS_CHOICES = [
        ('NEW', 'New'),
        ('UNDER_ANALYSIS', 'Under Analysis'),
        ('PREDICTION_ACTIVE', 'Prediction Active'),
        ('INTERCEPTED', 'Intercepted'),
        ('CLOSED', 'Closed'),
        ('FALSE_ALARM', 'False Alarm'),
    ]

    PRIORITY_CHOICES = [
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
        ('CRITICAL', 'Critical'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    complaint_number = models.CharField(max_length=50, unique=True, blank=True)
    
    victim_name = models.CharField(max_length=255)
    victim_phone = models.CharField(max_length=20)
    victim_email = models.EmailField(blank=True)
    victim_district = models.CharField(max_length=100)
    victim_state = models.CharField(max_length=100)
    victim_pincode = models.CharField(max_length=10)
    
    fraud_amount = models.DecimalField(max_digits=12, decimal_places=2)
    fraud_method = models.CharField(max_length=50, choices=FRAUD_METHODS)
    
    fraud_timestamp = models.DateTimeField()
    complaint_timestamp = models.DateTimeField(auto_now_add=True)
    
    suspect_account_number = models.CharField(max_length=100, blank=True)
    suspect_bank = models.CharField(max_length=100, blank=True)
    suspect_phone = models.CharField(max_length=20, blank=True)
    
    narrative_text = models.TextField()
    
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='NEW')
    priority = models.CharField(max_length=50, choices=PRIORITY_CHOICES, default='MEDIUM')
    
    assigned_officer = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_complaints')
    organization = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name='complaints')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'complaints'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.complaint_number} - {self.victim_name}"

    def save(self, *args, **kwargs):
        if not self.complaint_number:
            import re
            from django.db import transaction
            year = datetime.datetime.now().year
            
            with transaction.atomic():
                candidates = Complaint.objects.select_for_update().filter(
                    complaint_number__regex=rf'^CC-{year}-\d+$'
                ).values_list('complaint_number', flat=True)
                
                max_num = 0
                for c_no in candidates:
                    match = re.search(rf'^CC-{year}-(\d+)$', c_no)
                    if match:
                        try:
                            val = int(match.group(1))
                            if val > max_num:
                                max_num = val
                        except ValueError:
                            pass
                
                new_num = max_num + 1
                new_c_no = f'CC-{year}-{new_num:05d}'
                while Complaint.objects.filter(complaint_number=new_c_no).exists():
                    new_num += 1
                    new_c_no = f'CC-{year}-{new_num:05d}'

                self.complaint_number = new_c_no
                super().save(*args, **kwargs)
        else:
            super().save(*args, **kwargs)

class TransactionHop(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name='transaction_hops')
    
    from_account = models.CharField(max_length=100)
    from_bank = models.CharField(max_length=100)
    from_ifsc = models.CharField(max_length=20, blank=True)
    
    to_account = models.CharField(max_length=100)
    to_bank = models.CharField(max_length=100)
    to_ifsc = models.CharField(max_length=20, blank=True)
    
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    timestamp = models.DateTimeField()
    
    hop_number = models.PositiveIntegerField()
    is_mule_flagged = models.BooleanField(default=False)
    
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'transaction_hops'
        ordering = ['complaint', 'hop_number']

    def __str__(self):
        return f"Hop {self.hop_number} for {self.complaint.complaint_number}"


class EvidenceItem(models.Model):
    EVIDENCE_TYPES = [
        ('CCTV_REQUEST', 'Section 91 CCTV Preservation Notice'),
        ('CCTV_FOOTAGE', 'ATM Kiosk CCTV Footage'),
        ('TRANSACTION_PROOF', 'Victim Transaction Proof / UTR Receipt'),
        ('BANK_STATEMENT', 'Bank Statement Excerpt'),
        ('SEIZURE_MEMO', 'On-Scene Seizure Memo / Panchnama'),
        ('OTHER', 'Other Documentation'),
    ]

    STATUS_CHOICES = [
        ('REQUEST_ISSUED', 'Notice Issued / Pending'),
        ('RECEIVED', 'Evidence Received'),
        ('SECURED', 'Secured & Cryptographically Sealed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name='evidence_items')
    evidence_type = models.CharField(max_length=50, choices=EVIDENCE_TYPES, default='TRANSACTION_PROOF')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to='evidence/%Y/%m/%d/', null=True, blank=True)
    file_name = models.CharField(max_length=255, blank=True)
    file_size_bytes = models.BigIntegerField(default=0)
    sha256_hash = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='SECURED')
    
    # Metadata for CCTV notices
    atm_id = models.CharField(max_length=100, blank=True)
    atm_address = models.TextField(blank=True)
    target_bank = models.CharField(max_length=100, blank=True)
    time_window_start = models.DateTimeField(null=True, blank=True)
    time_window_end = models.DateTimeField(null=True, blank=True)
    
    uploaded_by = models.CharField(max_length=100, default='Cyber Cell Duty Officer')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'evidence_items'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.get_evidence_type_display()}) - {self.complaint.complaint_number}"


class ChainOfCustodyLog(models.Model):
    ACTIONS = [
        ('CREATED', 'Evidence Created / Notice Issued'),
        ('FILE_UPLOADED', 'Binary File Uploaded'),
        ('HASH_VERIFIED', 'Cryptographic SHA-256 Hash Verified'),
        ('ACCESSED', 'Evidence Viewed by Investigator'),
        ('DOWNLOADED', 'Court Evidence Export Downloaded'),
        ('SEALED', 'Evidence Vault Sealed for Trial'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    evidence_item = models.ForeignKey(EvidenceItem, on_delete=models.CASCADE, related_name='custody_logs')
    action = models.CharField(max_length=50, choices=ACTIONS, default='CREATED')
    performed_by = models.CharField(max_length=100, default='System Automator')
    role = models.CharField(max_length=50, default='Investigator')
    ip_address = models.CharField(max_length=50, default='127.0.0.1')
    details = models.TextField(blank=True)
    hash_snapshot = models.CharField(max_length=64, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'evidence_custody_logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M')}] {self.action} by {self.performed_by}"

