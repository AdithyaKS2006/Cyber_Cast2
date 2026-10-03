import os
import secrets as _secrets
from pathlib import Path
from datetime import timedelta
import environ

env = environ.Env()
BASE_DIR = Path(__file__).resolve().parent.parent.parent
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

_secret_key = env('SECRET_KEY', default='')
if not _secret_key or _secret_key.startswith('django-insecure-'):
    if env.bool('DEBUG', default=False):
        _secret_key = 'django-insecure-dev-' + _secrets.token_hex(32)
    else:
        _secret_key = _secrets.token_urlsafe(64)
SECRET_KEY = _secret_key
DEBUG = env.bool('DEBUG', default=False)
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['*'])

CORS_ALLOW_CREDENTIALS = True

DJANGO_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',  # Required for logout token invalidation
    'corsheaders',
    'channels',
    'django_celery_beat',
    'django_celery_results',
    'django_prometheus',
    'drf_spectacular',
]

try:
    import debug_toolbar
    THIRD_PARTY_APPS.append('debug_toolbar')
except ImportError:
    pass

LOCAL_APPS = [
    'apps.core',
    'apps.users',
    'apps.guru',
    'apps.reports',
    'apps.ml_engine',
    'apps.complaints',
    'apps.predictions',
    'apps.dashboard',
    'apps.ingest',
    'apps.freeze',
    'apps.graph',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'django_prometheus.middleware.PrometheusBeforeMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'apps.core.middleware.SecurityHeadersMiddleware',
    'csp.middleware.CSPMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.middleware.gzip.GZipMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'django_ratelimit.middleware.RatelimitMiddleware',
    'django_prometheus.middleware.PrometheusAfterMiddleware',
    'apps.core.middleware.WAFMiddleware',
]

if 'debug_toolbar' in THIRD_PARTY_APPS:
    MIDDLEWARE.insert(10, 'debug_toolbar.middleware.DebugToolbarMiddleware')

ROOT_URLCONF = 'crimecast.urls'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [BASE_DIR / 'templates', BASE_DIR / 'frontend' / 'templates'],
    'APP_DIRS': True,
    'OPTIONS': {
        'context_processors': [
            'django.template.context_processors.debug',
            'django.template.context_processors.request',
            'django.contrib.auth.context_processors.auth',
            'django.contrib.messages.context_processors.messages',
        ],
    },
}]

ASGI_APPLICATION = 'crimecast.asgi.application'

USE_TZ = True
TIME_ZONE = 'UTC'

import dj_database_url

DATABASES = {
    'default': dj_database_url.config(
        default=env('DATABASE_URL', default='sqlite:///db.sqlite3'),
        conn_max_age=600,
        conn_health_checks=True,
        ssl_require=env.bool('DATABASE_SSL', default=False),
    )
}
if DATABASES['default']['ENGINE'] == 'django.db.backends.postgresql':
    DATABASES['default']['ENGINE'] = 'dj_db_conn_pool.backends.postgresql'
    DATABASES['default']['POOL_OPTIONS'] = {
        'POOL_SIZE': 20,
        'MAX_OVERFLOW': 10,
        'POOL_TIMEOUT': 30,
        'POOL_RECYCLE': 1800,
    }

# Read replica configuration (optional, for production scalability)
DATABASE_REPLICA_URL = env('DATABASE_REPLICA_URL', default='')
if DATABASE_REPLICA_URL:
    import dj_database_url
    DATABASES['replica'] = dj_database_url.config(
        default=DATABASE_REPLICA_URL,
        conn_max_age=600,
        ssl_require=env.bool('DATABASE_SSL', default=False),
    )
    DATABASE_ROUTERS = ['apps.core.db_router.ReadReplicaRouter']

REDIS_URL = env('REDIS_URL', default='')
if REDIS_URL:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [REDIS_URL],
            },
        },
    }
    CELERY_BROKER_URL = REDIS_URL
    CELERY_RESULT_BACKEND = 'django-db'
    CELERY_CACHE_BACKEND = 'django-cache'
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True
    CELERY_BROKER_URL = 'memory://'
    CELERY_RESULT_BACKEND = 'cache+memory://'
    CELERY_CACHE_BACKEND = 'default'

CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_TASK_TRACK_STARTED = True
CELERY_TIMEZONE = 'UTC'
CELERY_TASK_SERIALIZER = 'json'
CELERY_ACCEPT_CONTENT = ['json']

CELERY_TASK_ROUTES = {
    'apps.core.tasks.check_sla_warnings': {'queue': 'low_priority'},
    'apps.core.tasks.send_notification_email': {'queue': 'low_priority'},
    'apps.core.tasks.send_system_email': {'queue': 'low_priority'},
    'apps.core.tasks.send_report_ready_notification': {'queue': 'low_priority'},
    'apps.reports.tasks.generate_report_task': {'queue': 'report_generation'},
}

CELERY_TASK_QUEUES = {
    'high_priority': {'exchange': 'high_priority', 'routing_key': 'high'},
    'medium_priority': {'exchange': 'medium_priority', 'routing_key': 'medium'},
    'low_priority': {'exchange': 'low_priority', 'routing_key': 'low'},
    'report_generation': {'exchange': 'report_generation', 'routing_key': 'report'},
}


# ── Email configuration ────────────────────────────────────────────────────────
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', default='noreply@crimecast.io')
PLATFORM_URL = env('PLATFORM_URL', default='https://crimecast.io')
EMAIL_BACKEND = env('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = env('EMAIL_HOST', default='localhost')
EMAIL_PORT = env.int('EMAIL_PORT', default=587)
EMAIL_HOST_USER = env('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD', default='')
EMAIL_USE_TLS = env.bool('EMAIL_USE_TLS', default=True)
EMAIL_TIMEOUT = 30


# ── Celery Beat periodic schedule ─────────────────────────────────────────────
from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    'check-sla-warnings': {
        'task': 'apps.core.tasks.check_sla_warnings',
        'schedule': crontab(minute='*/5'),  # Every 5 minutes
    },
    'check-model-drift': {
        'task': 'apps.ml_engine.tasks.check_all_model_drift',
        'schedule': crontab(hour=6, minute=0),  # Daily at 06:00 UTC
    },
    'update-prometheus-metrics': {
        'task': 'apps.core.tasks.update_metrics',
        'schedule': 60.0,  # Every minute
    },
}

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.users.authentication.CookieJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.StandardPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'EXCEPTION_HANDLER': 'apps.core.exception_handler.custom_exception_handler',
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.AnonRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'user': '1000/day',
        'anon': '100/day',
        'auth': '30/min',
        'upload': '20/hour',
        'bulk': '30/hour',
    },
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'CrimeCast API',
    'DESCRIPTION': '''
# Predictive Analytics Framework for Cybercrime Cash-Out Interception

## Authentication
This API uses JWT tokens stored in httpOnly cookies.

To authenticate via Swagger UI:
1. Use the `/api/v1/auth/login/` endpoint to login
2. The response sets an `access_token` cookie automatically
3. All subsequent requests include this cookie

## Rate Limits
- Login: 10 requests per minute per IP
- Register: 5 requests per hour per IP
- ML Classify: 100 requests per minute per user
    ''',
    'VERSION': '2.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'SCHEMA_PATH_PREFIX': '/api/v1/',
    'COMPONENT_SPLIT_REQUEST': True,
    'SORT_OPERATIONS': False,
    'SWAGGER_UI_SETTINGS': {
        'deepLinking': True,
        'persistAuthorization': True,
        'displayOperationId': True,
        'defaultModelsExpandDepth': 2,
    },
    # Security scheme for cookie auth
    'SECURITY': [{'cookieAuth': []}],
    'COMPONENTS': {
        'securitySchemes': {
            'cookieAuth': {
                'type': 'apiKey',
                'in': 'cookie',
                'name': 'access_token',
                'description': 'JWT token stored in httpOnly cookie. Login via /api/v1/auth/login/ to set automatically.',
            }
        }
    },
    'POSTPROCESSING_HOOKS': [
        'drf_spectacular.hooks.postprocess_schema_enums',
    ],
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=2),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}

AUTH_USER_MODEL = 'users.User'

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 8,
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# CORS — permissive defaults for demo/cloud deployment
CORS_ALLOW_ALL_ORIGINS = env.bool('CORS_ALLOW_ALL_ORIGINS', default=True)
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=[
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
])
CORS_ALLOW_CREDENTIALS = True
JWT_COOKIE_SAMESITE = env('JWT_COOKIE_SAMESITE', default='None' if not DEBUG else 'Lax')
JWT_COOKIE_SECURE = env.bool('JWT_COOKIE_SECURE', default=not DEBUG)
CORS_ALLOW_METHODS = ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']
CORS_ALLOW_HEADERS = [
    'accept', 'accept-encoding', 'authorization',
    'content-type', 'dnt', 'origin', 'user-agent',
    'x-csrftoken', 'x-requested-with', 'x-agent-key',
]

CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=[
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'https://*.onrender.com',
    'https://*.railway.app',
    'https://*.ngrok-free.app',
    'https://*.loca.lt',
])

# ML Models paths
ML_MODELS_DIR = BASE_DIR / 'ml_models' / 'saved_models'
ML_TRAINING_DATA_DIR = BASE_DIR / 'ml_models' / 'training_data'

# External API Keys
VIRUSTOTAL_API_KEY = env('VIRUSTOTAL_API_KEY', default='')
GEMINI_API_KEY = env('GEMINI_API_KEY', default='')
SHODAN_API_KEY = env('SHODAN_API_KEY', default='')

# Webhook Ingestion Secrets
WEBHOOK_SECRETS = env.dict('WEBHOOK_SECRETS', default={'NPCI': 'dev-secret-change-in-prod'})

# I4C API Integration Settings
I4C_MOCK_MODE = env.bool('I4C_MOCK_MODE', default=True)
I4C_API_BASE_URL = env('I4C_API_BASE_URL', default='https://api.i4c.gov.in/v1')
I4C_API_TOKEN = env('I4C_API_TOKEN', default='mock-token')
NODAL_PING_MOCK_MODE = env.bool('NODAL_PING_MOCK_MODE', default=True)

# WAF: Internal agent key — MUST be set in .env for production
# Any request bearing X-Agent-Key: <this value> bypasses the WAF rate limiter.
# Presence-only check is a security hole; we validate the value.
INTERNAL_AGENT_KEY = env('INTERNAL_AGENT_KEY', default='')

# GDPR: Anonymize IP addresses in audit logs
# Set to True in production for GDPR compliance
ANONYMIZE_IP_ADDRESSES = env.bool('ANONYMIZE_IP_ADDRESSES', default=False)

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {
            '()': 'pythonjsonlogger.json.JsonFormatter',
            'format': '%(asctime)s %(name)s %(levelname)s %(message)s %(pathname)s %(lineno)d',
        },
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'filters': {
        'sensitive_data': {
            '()': 'apps.core.logging_filters.SensitiveDataFilter',
        },
        'require_debug_false': {
            '()': 'django.utils.log.RequireDebugFalse',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
            'filters': ['sensitive_data'],
        },
        'file_info': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'info.log',
            'maxBytes': 50 * 1024 * 1024,
            'backupCount': 5,
            'formatter': 'json',
            'filters': ['sensitive_data'],
            'level': 'INFO',
        },
        'file_error': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'error.log',
            'maxBytes': 50 * 1024 * 1024,
            'backupCount': 10,
            'formatter': 'json',
            'filters': ['sensitive_data'],
            'level': 'ERROR',
        },
        'security': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'security.log',
            'maxBytes': 50 * 1024 * 1024,
            'backupCount': 20,
            'formatter': 'json',
            'level': 'WARNING',
        },
        'mail_admins': {
            'level': 'CRITICAL',
            'class': 'django.utils.log.AdminEmailHandler',
            'filters': ['require_debug_false', 'sensitive_data'],
        },
    },
    'loggers': {
        'django': {'handlers': ['console', 'file_info'], 'level': 'INFO', 'propagate': False},
        'django.security': {'handlers': ['security', 'console'], 'level': 'WARNING', 'propagate': False},
        'crimecast': {'handlers': ['console', 'file_info', 'file_error'], 'level': 'DEBUG', 'propagate': False},
        'crimecast.errors': {'handlers': ['file_error', 'mail_admins'], 'level': 'ERROR', 'propagate': False},
        'celery': {'handlers': ['console', 'file_info'], 'level': 'INFO', 'propagate': False},
    },
    'root': {'handlers': ['console', 'file_error'], 'level': 'WARNING'},
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REDIS_URL = env('REDIS_URL', default='')
if REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': env('REDIS_URL_CACHE', default='redis://127.0.0.1:6379/1'),
            'OPTIONS': {
                'CLIENT_CLASS': 'django_redis.client.DefaultClient',
                'CONNECTION_POOL_KWARGS': {'max_connections': 50},
            },
            'TIMEOUT': 300,
            'KEY_PREFIX': 'crimecast',
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'crimecast-dev',
            'TIMEOUT': 300,
            'KEY_PREFIX': 'crimecast',
        }
    }

INTERNAL_IPS = ['127.0.0.1']

# Content Security Policy (django-csp)
CSP_DEFAULT_SRC = ("'self'",)
CSP_SCRIPT_SRC = ("'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com")
CSP_STYLE_SRC = ("'self'", "'unsafe-inline'", "https://fonts.googleapis.com")
CSP_FONT_SRC = ("'self'", "https://fonts.gstatic.com")
CSP_IMG_SRC = ("'self'", "data:", "https:")
CSP_CONNECT_SRC = ("'self'", "wss:", "ws:")
CSP_FRAME_ANCESTORS = ("'none'",)

# Dispatch delivery mode: 'SIMULATED' (dev/demo) or 'LIVE' (production CFCFRMS integration)

DISPATCH_DELIVERY_MODE = os.environ.get('DISPATCH_DELIVERY_MODE', 'SIMULATED')

# Demo Mode Flag
DEMO_MODE = env.bool('DEMO_MODE', default=True)
