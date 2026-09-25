import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from apps.freeze.models import FreezeRequest
from apps.freeze.serializers import FreezeRequestSerializer
from apps.freeze.nodal_ping import ping_nodal_officer

logger = logging.getLogger('crimecast.freeze')


class FreezeQueueAPIView(APIView):
    """
    GET /api/v2/freeze/queue/
    Returns list of recent FreezeRequests (limit 10) ordered by requested_at desc.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        queryset = FreezeRequest.objects.all().order_by('-requested_at')[:10]
        serializer = FreezeRequestSerializer(queryset, many=True)
        return Response(serializer.data)


class FreezeManualPingAPIView(APIView):
    """
    POST /api/v2/freeze/<uuid:freeze_id>/manual-ping/
    Manually triggers an urgent Nodal Officer alert ping for a FreezeRequest.
    """
    permission_classes = [AllowAny]

    def post(self, request, freeze_id):
        try:
            freeze_req = FreezeRequest.objects.get(id=freeze_id)
        except FreezeRequest.DoesNotExist:
            return Response({"error": "FreezeRequest not found"}, status=status.HTTP_404_NOT_FOUND)

        success = ping_nodal_officer(freeze_req)

        return Response({
            "freeze_id": str(freeze_req.id),
            "status": "PING_DISPATCHED" if success else "PING_FAILED",
            "success": success,
            "message": "Manual ping transmitted to Nodal Officer" if success else "Failed to send manual ping (missing email contact)"
        })


from django.http import HttpResponse
from apps.freeze.notice_generator import generate_bnss_106_notice_pdf


class FreezeNoticePDFAPIView(APIView):
    """
    GET /api/v2/freeze/<uuid:freeze_id>/notice/
    Generates and returns an official court-ready Statutory Freeze Directive PDF
    under Section 106 & Section 94 of BNSS 2023 with SHA-256 digital evidence hash.
    """
    permission_classes = [AllowAny]

    def get(self, request, freeze_id):
        try:
            freeze_req = FreezeRequest.objects.get(id=freeze_id)
        except FreezeRequest.DoesNotExist:
            return Response({"error": "FreezeRequest not found"}, status=status.HTTP_404_NOT_FOUND)

        pdf_bytes = generate_bnss_106_notice_pdf(freeze_req)
        filename = f"BNSS_Sec106_FreezeNotice_{str(freeze_req.id)[:8].upper()}.pdf"

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['X-BNSS-Section'] = '106'
        response['X-Digital-Evidence'] = 'BSA-2023-Sec-63'
        return response


from django.utils import timezone


class FreezeConfirmAPIView(APIView):
    """
    POST /api/v2/freeze/<uuid:freeze_id>/confirm/
    Confirms bank lien status for a FreezeRequest with bank acknowledgment reference
    and actual secured funds amount (closing the Golden Window loop).
    """
    permission_classes = [AllowAny]

    def post(self, request, freeze_id):
        try:
            freeze_req = FreezeRequest.objects.get(id=freeze_id)
        except FreezeRequest.DoesNotExist:
            return Response({"error": "FreezeRequest not found"}, status=status.HTTP_404_NOT_FOUND)

        bank_ack_ref = request.data.get('bank_ack_ref', f"ACK-BNK-{timezone.now().strftime('%Y%m%d%H%M')}")
        confirmed_status = request.data.get('status', 'FROZEN')
        frozen_amount = request.data.get('frozen_amount', freeze_req.freeze_amount)
        officer_remarks = request.data.get('officer_remarks', 'Confirmed with Bank Nodal Team via I4C Hotline')

        freeze_req.status = confirmed_status
        freeze_req.resolved_at = timezone.now()
        
        raw = freeze_req.api_response_raw or {}
        raw.update({
            'bank_ack_ref': bank_ack_ref,
            'confirmed_frozen_amount': float(frozen_amount) if frozen_amount else float(freeze_req.freeze_amount),
            'officer_remarks': officer_remarks,
            'confirmed_at': timezone.now().isoformat(),
            'statutory_compliance': 'Section 106 CrPC / Section 107 BNSS 2023'
        })
        freeze_req.api_response_raw = raw
        freeze_req.save()

        # If linked complaint exists, mark interception/freeze active
        if freeze_req.complaint:
            freeze_req.complaint.status = 'INTERCEPTED'
            freeze_req.complaint.save(update_fields=['status'])

        return Response({
            "freeze_id": str(freeze_req.id),
            "target_account": freeze_req.target_account,
            "target_bank": freeze_req.target_bank_name,
            "status": freeze_req.status,
            "bank_ack_ref": bank_ack_ref,
            "frozen_amount": float(frozen_amount) if frozen_amount else float(freeze_req.freeze_amount),
            "resolved_at": freeze_req.resolved_at.isoformat(),
            "message": "Bank lien confirmed. Mule funds successfully secured under Section 106 BNSS."
        }, status=status.HTTP_200_OK)


