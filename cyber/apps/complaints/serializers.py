from rest_framework import serializers
from .models import Complaint, TransactionHop, EvidenceItem, ChainOfCustodyLog

class TransactionHopSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionHop
        fields = '__all__'
        read_only_fields = ['id', 'complaint', 'created_at', 'updated_at']


class ComplaintListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Complaint
        fields = [
            'id', 'complaint_number', 'victim_name', 'victim_district',
            'fraud_amount', 'fraud_method', 'status', 'priority', 'created_at'
        ]

class ComplaintDetailSerializer(serializers.ModelSerializer):
    transaction_hops = TransactionHopSerializer(many=True, read_only=True)
    
    class Meta:
        model = Complaint
        fields = '__all__'
        read_only_fields = ['id', 'complaint_number', 'created_at', 'updated_at']

class ComplaintCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Complaint
        fields = '__all__'
        read_only_fields = ['id', 'complaint_number', 'created_at', 'updated_at']


class ChainOfCustodyLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChainOfCustodyLog
        fields = '__all__'
        read_only_fields = ['id', 'timestamp']


class EvidenceItemSerializer(serializers.ModelSerializer):
    custody_logs = ChainOfCustodyLogSerializer(many=True, read_only=True)
    evidence_type_display = serializers.CharField(source='get_evidence_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    complaint_number = serializers.CharField(source='complaint.complaint_number', read_only=True)

    class Meta:
        model = EvidenceItem
        fields = '__all__'
        read_only_fields = ['id', 'sha256_hash', 'created_at', 'updated_at']

