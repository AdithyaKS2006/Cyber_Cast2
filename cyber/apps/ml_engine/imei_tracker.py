"""
CrimeCast IMEI & Device Intelligence Tracker
============================================
Tracks device fingerprints, IMEI reuse across multiple SIM cards,
and multi-complaint cross-references for cybercrime syndicates.

Implements requirements from MODEL_PRD.md Section 3 & 10:
  - imei_reuse_count
  - sim_activation_to_fraud_days
  - device_fingerprint_complaints
  - is_vpn_or_proxy_ip
"""
import re
import logging
from datetime import datetime, timedelta
from django.utils import timezone

logger = logging.getLogger('crimecast.ml_engine')

VPN_IP_PREFIXES = [
    '10.', '172.16.', '192.168.', '100.64.',  # CGNAT / Private
    '185.', '194.', '45.',                    # Common commercial VPN ranges
]

class IMEITracker:
    """
    Cross-complaint device tracker that identifies syndicated SIM disposal
    and repeated IMEI hardware usage.
    """

    @staticmethod
    def extract_imei_from_narrative(text):
        """Extracts potential 15-digit IMEI numbers from narrative or evidence text."""
        if not text:
            return None
        # Standard IMEI is 15 decimal digits (Luhn checked in production)
        matches = re.findall(r'\b\d{15}\b', str(text))
        return matches[0] if matches else None

    @classmethod
    def get_device_signals(cls, complaint, imei=None):
        """
        Analyzes a complaint to extract device & IMEI tracking signals.
        Returns a dictionary matching the feature vector specifications.
        """
        from apps.complaints.models import Complaint

        suspect_phone = getattr(complaint, 'suspect_phone', '') or ''
        suspect_acc   = getattr(complaint, 'suspect_account_number', '') or ''
        narrative     = getattr(complaint, 'narrative_text', '') or ''
        
        detected_imei = imei or cls.extract_imei_from_narrative(narrative)

        # Baseline defaults (single regular incident)
        imei_reuse_count = 1
        device_complaints = 1
        sim_age_days = 15  # Default ~2 weeks

        # 1. Search database for suspect phone reuse
        if suspect_phone:
            linked_phone_complaints = Complaint.objects.filter(
                suspect_phone=suspect_phone
            ).exclude(id=complaint.id)
            phone_count = linked_phone_complaints.count()
            if phone_count > 0:
                device_complaints += phone_count
                imei_reuse_count += min(phone_count, 5)

        # 2. Search database for suspect bank account reuse
        if suspect_acc:
            linked_acc_complaints = Complaint.objects.filter(
                suspect_account_number=suspect_acc
            ).exclude(id=complaint.id)
            acc_count = linked_acc_complaints.count()
            if acc_count > 0:
                device_complaints += acc_count
                imei_reuse_count += min(acc_count * 2, 6)

        # 3. If explicit IMEI is tracked, cross-reference in narratives
        if detected_imei:
            imei_linked = Complaint.objects.filter(
                narrative_text__icontains=detected_imei
            ).exclude(id=complaint.id).count()
            if imei_linked > 0:
                imei_reuse_count += (imei_linked * 2)
                device_complaints += imei_linked

        # 4. SIM activation heuristic:
        # High reuse / high hop velocity strongly correlates with fresh disposable SIMs (1-5 days)
        if imei_reuse_count >= 4 or device_complaints >= 3:
            sim_age_days = 2   # Throwaway SIM (Burner phone profile)
        elif imei_reuse_count >= 2:
            sim_age_days = 7   # 1-week mule rotation
        else:
            sim_age_days = 30  # Standard account

        # 5. Check VPN or Proxy in narrative / network indicators
        is_vpn = 0.0
        text_lower = narrative.lower()
        if any(term in text_lower for term in ['vpn', 'proxy', 'tor', 'anydesk', 'teamviewer', 'quicksupport', 'rustdesk']):
            is_vpn = 1.0

        # Cap features according to model specification
        imei_reuse_count  = min(12, max(1, imei_reuse_count))
        device_complaints = min(15, max(1, device_complaints))
        sim_age_days      = min(180, max(1, sim_age_days))

        return {
            "detected_imei": detected_imei,
            "imei_reuse_count": imei_reuse_count,
            "imei_reuse_count_norm": float(imei_reuse_count) / 12.0,
            "device_fingerprint_complaints": device_complaints,
            "device_fingerprint_complaints_norm": float(device_complaints) / 15.0,
            "sim_activation_to_fraud_days": sim_age_days,
            "sim_activation_to_fraud_days_norm": float(sim_age_days) / 180.0,
            "is_vpn_or_proxy_ip": is_vpn,
            "syndicate_suspected": bool(imei_reuse_count >= 3 or device_complaints >= 3),
        }
