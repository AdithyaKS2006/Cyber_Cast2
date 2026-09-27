"""
predictions/tasks.py — Celery task + sync helper for prediction generation.
Calls real ML engine → generates Gemini brief → fires WebSocket alert.
"""
import logging
from celery import shared_task
from django.utils import timezone
from apps.complaints.models import Complaint
from apps.users.models import User
from .models import CashOutPrediction, PredictionAlert

logger = logging.getLogger('predictions')

# Two-gate threshold system (HITL architecture — aligned with PRD & documentation):
AUTO_DISPATCH_THRESHOLD = 0.00   # Set to 0.0 for Demo Mode: always auto-dispatch
HITL_REVIEW_THRESHOLD   = 0.35   # 35–70%: routes to analyst NEEDS_REVIEW queue
# < 35%: low confidence — also NEEDS_REVIEW (human gate always applies)

def run_prediction_pipeline(complaint: Complaint) -> list:
    """
    Core pipeline: ML inference → Gemini brief → DB save → WebSocket alert.
    Returns list of created CashOutPrediction objects.
    Safe to call from a background thread (handles Django DB connection lifecycle).
    """
    from django.db import close_old_connections
    close_old_connections()

    # ── Try real ML engine ──────────────────────────────────────────
    top5_zones = None
    try:
        from apps.ml_engine.cashout_predictor import get_predictor_instance
        try:
            from apps.ml_engine.fraud_features_v2 import FraudFeatureExtractorV2
            extractor = FraudFeatureExtractorV2()
        except Exception:
            from apps.ml_engine.fraud_features import FraudFeatureExtractor
            extractor = FraudFeatureExtractor()

        hops = list(complaint.transaction_hops.all().order_by('hop_number'))
        features = extractor.extract(complaint, hops)
        predictor = get_predictor_instance()
        result = predictor.predict(features, feature_names=extractor.get_feature_names(), complaint=complaint)
        if isinstance(result, list) and len(result) > 0:
            top5_zones = result

        logger.info('ML engine returned %d zones for %s', len(top5_zones or []), complaint.complaint_number)
    except Exception as exc:
        logger.error('ML engine failed (%s)', exc, exc_info=True)
        import sentry_sdk
        sentry_sdk.capture_exception(exc)

    # ── No fallback — if missing, fail loud and honestly ───────────────────
    if not top5_zones:
        logger.error('ML model unavailable or failed to predict for complaint %s. Setting status to MODEL_UNAVAILABLE.', complaint.complaint_number)
        complaint.status = 'MODEL_UNAVAILABLE'
        complaint.save(update_fields=['status'])
        return []

    # ── Persist predictions ───────────────────────────────────────────────
    CashOutPrediction.objects.filter(complaint=complaint).delete()
    created = []
    
    is_auto_dispatch = top5_zones[0]['probability'] >= AUTO_DISPATCH_THRESHOLD
    outcome_status = 'PENDING' if is_auto_dispatch else 'NEEDS_REVIEW'

    for rank, zone in enumerate(top5_zones[:5], 1):
        pred = CashOutPrediction.objects.create(
            complaint=complaint,
            predicted_zone_name=zone.get('zone_name', 'Unknown'),
            predicted_lat=zone['lat'],
            predicted_lon=zone['lon'],
            probability=zone['probability'],
            eta_hours=zone.get('eta_hours', 4.0),
            rank=rank,
            model_version='v1.0-lightgbm',
            feature_importance_json=zone.get('feature_importance_json', {}),
            outcome=outcome_status,
        )
        created.append(pred)

    # ── Gemini brief for rank-1 prediction ───────────────────────────────
    if created:
        top_pred = created[0]
        try:
            from apps.guru.investigation_brief import generate_investigation_brief
            brief = generate_investigation_brief(top_pred, use_fast_fallback=True)
            top_pred.gemini_brief = brief
            top_pred.save(update_fields=['gemini_brief'])
            logger.info('Gemini brief saved for prediction %s', top_pred.pk)
        except Exception as exc:
            logger.error('Gemini brief generation error: %s', exc, exc_info=True)
            import sentry_sdk
            sentry_sdk.capture_exception(exc)

    # ── Update complaint status ───────────────────────────────────────────
    complaint.status = 'PREDICTION_ACTIVE'
    complaint.save(update_fields=['status'])

    # ── Create WebSocket alert for assigned officer ───────────────────────
    officer = complaint.assigned_officer or User.objects.filter(is_active=True).first()
    if officer and created:
        alert = PredictionAlert.objects.create(
            prediction=created[0],
            officer=officer,
            alert_type='WEBSOCKET',
            status='SENT',
        )
        _push_ws_alert(alert, created[0], complaint)

    # ── Auto-dispatch Intelligence Package (only at >= 70% confidence) ─────
    if top5_zones[0]['probability'] >= AUTO_DISPATCH_THRESHOLD and created:
        try:
            from .dispatch import dispatch_intelligence
            logger.info(
                'High-confidence prediction (%.2f >= %.2f): Auto-dispatching intelligence package.',
                top5_zones[0]['probability'], AUTO_DISPATCH_THRESHOLD
            )
            dispatch_intelligence(created[0])
        except Exception as exc:
            logger.error('Failed to auto-dispatch intelligence package: %s', exc)

    return created


def _push_ws_alert(alert, prediction, complaint):
    """Push prediction alert to WebSocket group for the organisation."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        org_id = str(complaint.organization_id) if complaint.organization_id else 'default'
        layer  = get_channel_layer()
        async_to_sync(layer.group_send)(
            f'prediction_alerts_{org_id}',
            {
                'type': 'prediction_alert',
                'data': {
                    'complaint_id': str(complaint.complaint_number),
                    'zone': prediction.predicted_zone_name,
                    'probability': prediction.probability,
                    'eta': prediction.eta_hours,
                    'fraud_amount': float(complaint.fraud_amount),
                }
            }
        )
    except Exception as exc:
        logger.warning('WebSocket push failed: %s', exc)


@shared_task
def generate_prediction_task(complaint_id: str):
    """Celery-async entry point."""
    try:
        complaint = Complaint.objects.get(id=complaint_id)
        preds = run_prediction_pipeline(complaint)
        return f'Generated {len(preds)} predictions for {complaint.complaint_number}'
    except Complaint.DoesNotExist:
        return f'Complaint {complaint_id} not found'
    except Exception as exc:
        logger.error('Prediction task failed: %s', exc)
        raise
