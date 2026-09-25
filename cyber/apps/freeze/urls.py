from django.urls import path
from apps.freeze.views import (
    FreezeQueueAPIView,
    FreezeManualPingAPIView,
    FreezeNoticePDFAPIView,
    FreezeConfirmAPIView
)


app_name = 'freeze'

urlpatterns = [
    path('queue/', FreezeQueueAPIView.as_view(), name='freeze-queue'),
    path('<uuid:freeze_id>/manual-ping/', FreezeManualPingAPIView.as_view(), name='freeze-manual-ping'),
    path('<uuid:freeze_id>/notice/', FreezeNoticePDFAPIView.as_view(), name='freeze-notice-pdf'),
    path('<uuid:freeze_id>/confirm/', FreezeConfirmAPIView.as_view(), name='freeze-confirm'),
]


