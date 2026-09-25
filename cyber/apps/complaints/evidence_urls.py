from django.urls import path
from apps.complaints.views import (
    EvidenceListCreateAPIView,
    EvidenceVerifyHashAPIView,
    Sec91CCTVNoticeAPIView
)

urlpatterns = [
    path('', EvidenceListCreateAPIView.as_view(), name='evidence-root-list-create'),
    path('<uuid:pk>/verify/', EvidenceVerifyHashAPIView.as_view(), name='evidence-root-verify'),
    path('cctv-notice/', Sec91CCTVNoticeAPIView.as_view(), name='evidence-root-cctv-notice'),
]
