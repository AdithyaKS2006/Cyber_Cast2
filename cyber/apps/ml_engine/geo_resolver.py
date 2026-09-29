"""
CrimeCast Universal Geo-Resolver
================================
Resolves ANY district, town, or city in India to precise geographic coordinates.
Utilizes an offline canonical Indian District Registry with fallback to OpenStreetMap
Nominatim and local disk-based caching.
"""

import os
import json
import re
import urllib.parse
import urllib.request
import logging

logger = logging.getLogger('crimecast')

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(CURRENT_DIR, 'data')
DISTRICTS_FILE = os.path.join(DATA_DIR, 'india_districts.json')
CACHE_FILE = os.path.join(DATA_DIR, 'geo_cache.json')


class GeoResolver:
    _instance = None
    _districts = []
    _alias_map = {}
    _cache = {}

    def __init__(self):
        self._load_districts()
        self._load_cache()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = GeoResolver()
        return cls._instance

    def _load_districts(self):
        if os.path.exists(DISTRICTS_FILE):
            try:
                with open(DISTRICTS_FILE, 'r', encoding='utf-8') as f:
                    self._districts = json.load(f)
                    for item in self._districts:
                        # Index primary names
                        key = item['name'].lower()
                        self._alias_map[key] = item
                        self._alias_map[item['district'].lower()] = item
                        # Index all aliases
                        for alias in item.get('aliases', []):
                            self._alias_map[alias.lower()] = item
            except Exception as e:
                logger.error(f"Failed to load india_districts.json: {e}")

    def _load_cache(self):
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    self._cache = json.load(f)
            except Exception:
                self._cache = {}

    def _save_cache(self):
        try:
            with open(CACHE_FILE, 'w', encoding='utf-8') as f:
                json.dump(self._cache, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not persist geo_cache.json: {e}")

    def resolve(self, query: str):
        """
        Resolves location name to lat/lon and metadata.
        Returns dict or None.
        """
        if not query or not str(query).strip():
            return None

        clean_query = str(query).lower().strip()

        # 1. Direct alias match
        if clean_query in self._alias_map:
            return dict(self._alias_map[clean_query])

        # 2. Substring scan across canonical district alias keywords
        for alias, d in self._alias_map.items():
            if len(alias) >= 4 and re.search(r'\b' + re.escape(alias) + r'\b', clean_query):
                return dict(d)

        # 3. Cache lookup
        if clean_query in self._cache:
            return dict(self._cache[clean_query])

        # 4. Fallback to OpenStreetMap Nominatim (timeout 2s)
        try:
            encoded = urllib.parse.quote(f"{clean_query}, India")
            url = f"https://nominatim.openstreetmap.org/search?q={encoded}&format=json&countrycodes=in&limit=1"
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "CrimeCast-Predictive-Cyber-Intelligence/3.0"}
            )
            with urllib.request.urlopen(req, timeout=2.5) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
                    if data and len(data) > 0:
                        top = data[0]
                        res = {
                            "name": clean_query.title(),
                            "district": clean_query.title(),
                            "state": "India",
                            "lat": round(float(top['lat']), 4),
                            "lon": round(float(top['lon']), 4),
                            "aliases": [clean_query],
                            "is_online_resolved": True
                        }
                        self._cache[clean_query] = res
                        self._save_cache()
                        return res
        except Exception as exc:
            logger.debug(f"Online geocoding fallback failed for '{clean_query}': {exc}")

        return None

    def detect_telecom_zone(self, complaint):
        """
        Scans a complaint for location keywords in narrative, suspect address,
        transaction hops, or victim location, and returns resolved zone info.
        """
        if not complaint:
            return None

        texts = []
        if hasattr(complaint, 'narrative_text') and complaint.narrative_text:
            texts.append(complaint.narrative_text)
        if hasattr(complaint, 'description') and complaint.description:
            texts.append(complaint.description)
        if hasattr(complaint, 'suspect_address') and complaint.suspect_address:
            texts.append(complaint.suspect_address)

        # Transaction hops
        try:
            for h in complaint.transaction_hops.all():
                if getattr(h, 'location_name', None):
                    texts.append(h.location_name)
                if getattr(h, 'to_bank', None):
                    texts.append(h.to_bank)
        except Exception:
            pass

        full_corpus = " ".join(texts)

        # First scan for high-priority telecom signals in the narrative/suspect info
        resolved = self.resolve(full_corpus)
        if resolved:
            return resolved

        # Otherwise check victim district
        v_dist = getattr(complaint, 'victim_district', None)
        if v_dist:
            return self.resolve(v_dist)

        return None
