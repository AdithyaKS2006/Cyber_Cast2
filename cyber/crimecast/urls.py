"""
URL configuration for crimecast project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from django.shortcuts import render
from django.http import JsonResponse
from django.utils import timezone
from apps.core.views import landing_view, app_view, health_check, client_error_view, agent_status_view, integration_test_view, system_config_view
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from django_prometheus import exports
from rest_framework.decorators import api_view
from rest_framework.response import Response as DRFResponse


def handler404(request, exception):
    """Custom 404 handler — JSON for API paths, HTML for frontend."""
    if request.path.startswith('/api/'):
        return JsonResponse({'error': 'Not found', 'code': 'not_found', 'status': 404}, status=404)
    return render(request, '404.html', status=404)


def handler500(request):
    """Custom 500 handler — JSON for API paths, HTML for frontend."""
    if request.path.startswith('/api/'):
        return JsonResponse({'error': 'Internal server error', 'code': 'server_error', 'status': 500}, status=500)
    return render(request, '500.html', status=500)


def handler429(request, exception):
    from django.http import JsonResponse
    retry_after = getattr(exception, 'retry_after', 60)
    return JsonResponse(
        {'error': 'Rate limit exceeded', 'retry_after': retry_after},
        status=429
    )

import environ
from django.conf import settings

env = environ.Env()
ADMIN_URL = env('DJANGO_ADMIN_URL', default='admin/')

urlpatterns = [
    path(ADMIN_URL, admin.site.urls),
    
    # Frontend views (Django renders the HTML shell)
    path('', landing_view, name='landing'),
    path('app/', app_view, name='app'),
    
    # API routes
    path('api/v1/', include([
        path('', include('apps.users.urls')),
        path('guru/', include('apps.guru.urls')),
        path('ai/', include('apps.ml_engine.urls')),
        path('reports/', include('apps.reports.urls')),
        path('complaints/', include('apps.complaints.urls')),
        path('evidence/', include('apps.complaints.evidence_urls')),
        path('predictions/', include('apps.predictions.urls')),
        path('dashboard/', include('apps.dashboard.urls')),
        path('analytics/', include('apps.dashboard.urls')),
        path('admin/', include('apps.core.admin_api_urls')),
        path('health/', health_check, name='health_check'),
        path('agents/status/', agent_status_view, name='agent_status'),
    ])),

    # API v2 routes
    path('api/v2/ingest/', include('apps.ingest.urls')),
    path('api/v2/graph/', include('apps.graph.urls')),
    path('api/v1/graph/', include('apps.graph.urls')),
    path('api/v2/freeze/', include('apps.freeze.urls')),
    path('api/v1/freeze/', include('apps.freeze.urls')),

    path('api/v2/system/config/', system_config_view, name='system_config'),


    # Legal pages
    path('privacy/', TemplateView.as_view(template_name='privacy.html'), name='privacy'),
    path('terms/', TemplateView.as_view(template_name='terms.html'), name='terms'),
    path('cookies/', TemplateView.as_view(template_name='cookies.html'), name='cookies'),

    # API documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),

    path('api/v1/core/', include([
        path('client-error/', client_error_view, name='client_error'),
        path('integrations/test/', integration_test_view, name='integration_test'),
    ])),
    
    # Prometheus metrics
    path('metrics/', exports.ExportToDjangoView, name='prometheus-django-metrics'),
    path('', include('django_prometheus.urls')),
]

if settings.DEBUG:
    try:
        import debug_toolbar
        urlpatterns += [path('__debug__/', include(debug_toolbar.urls))]
    except ImportError:
        pass
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
