"""
Supabase client helper for CrimeCast backend.
Provides singleton client for Supabase Storage, Auth, and Realtime interaction.
"""
import os
import environ
from supabase import create_client, Client

env = environ.Env()

SUPABASE_URL = env('SUPABASE_URL', default='https://qvgpzxvnoxausyiemgaq.supabase.co')
SUPABASE_KEY = env('SUPABASE_ANON_KEY', default='')

_client: Client = None

def get_supabase_client() -> Client:
    """Return an initialized Supabase Python client."""
    global _client
    if _client is None:
        if not SUPABASE_KEY:
            raise ValueError("SUPABASE_ANON_KEY is not configured in environment")
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client
