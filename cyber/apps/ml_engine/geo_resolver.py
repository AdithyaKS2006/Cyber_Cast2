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

        # 2. Substring scan across canonical district alias keywords (min len 3 to support Goa, Nuh, Leh, etc.)
        for alias, d in self._alias_map.items():
            if len(alias) >= 3 and re.search(r'\b' + re.escape(alias) + r'\b', clean_query):
                return dict(d)

        # 3. Cache lookup
        if clean_query in self._cache:
            return dict(self._cache[clean_query])

        # 4. Fallback to OpenStreetMap Nominatim (timeout 2s)
        try:
            encoded = urllib.parse.quote(f"{clean_query}, India")
            url = f"https://nominatim.openstreetmap.org/search?q={encoded}&format=json&countrycodes=in&limit=1&addressdetails=1"
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "CrimeCast-Predictive-Cyber-Intelligence/3.0"}
            )
            with urllib.request.urlopen(req, timeout=2.5) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
                    if data and len(data) > 0:
                        top = data[0]
                        addr = top.get('address', {})
                        detected_state = addr.get('state') or addr.get('state_district') or "India"
                        detected_district = addr.get('state_district') or addr.get('county') or clean_query.title()
                        res = {
                            "name": clean_query.title(),
                            "district": detected_district,
                            "state": detected_state,
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

    def _extract_contextual_location(self, text: str, victim_district: str = None):
        """
        Extracts geographic entities from narrative/telecom text using criminological
        context scoring (suspect/mule/CDR/ATM indicators vs victim indicators).
        Implements Law 1 (Geographic Separation Law).
        """
        if not text:
            return None

        clean = text.lower()
        SUSPECT_KEYWORDS = {
            "suspect", "mule", "cdr", "cell", "tower", "telecom", "triangulat",
            "corridor", "routed", "atm", "cash", "withdrawn", "active", "session",
            "gateway", "ip", "imei", "hop", "near", "location", "circle"
        }
        VICTIM_KEYWORDS = {
            "victim", "complainant", "targeted", "reported", "filed", "residing", "native", "from"
        }

        candidates = {}
        for alias, d in self._alias_map.items():
            if len(alias) >= 3:
                # Law 1: Exclude victim district from suspect cash-out zone candidate matching
                # (Fallback to victim district is handled separately at the end if no suspect footprint exists)
                if victim_district and (victim_district.lower() in alias or alias in victim_district.lower()):
                    continue

                for match in re.finditer(r'\b' + re.escape(alias) + r'\b', clean):
                    start, end = match.span()
                    # 60 character contextual window around match
                    window = clean[max(0, start - 60):min(len(clean), end + 60)]
                    score = 1  # base detection score
                    for kw in SUSPECT_KEYWORDS:
                        if kw in window:
                            score += 3
                    for kw in VICTIM_KEYWORDS:
                        if kw in window:
                            score -= 2

                    d_name = d["name"]
                    if d_name not in candidates or candidates[d_name]["score"] < score:
                        candidates[d_name] = {"geo": dict(d), "score": score, "alias": alias}

        if candidates:
            sorted_candidates = sorted(candidates.values(), key=lambda x: x["score"], reverse=True)
            top = sorted_candidates[0]
            # Only accept candidate if it has positive suspect/telecom context score (> 0)
            # If the only match was a penalized victim location, allow unknown entity extraction (2b) to proceed
            if top["score"] > 0:
                return top["geo"]

        return None

    def _extract_unknown_candidate_entities(self, text: str, victim_district: str = None):
        """
        Extracts candidate proper nouns / location phrases following spatial indicators
        to resolve unseen/unimaginable locations across India via OSM Nominatim.
        """
        if not text:
            return None

        patterns = [
            r'(?:operating near|sessions near|corridor near|active near|withdrawn at|mule in|located in|active in|sessions in|spotted at|traced to|near)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)',
            r'([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(?:central commercial|commercial corridor|central corridor|commercial hub|market corridor|promenade)'
        ]

        STOP_WORDS = {
            "an online", "stolen funds", "live isp", "cell tower", "active suspect",
            "central commercial", "multiple mule", "telecom zone", "commercial corridor",
            "investment task", "central bank", "state bank", "bank", "mule account",
            "payment method", "fraud amount", "online investment", "central telecom",
            "cdr", "isp", "sim", "imei", "nach", "atm", "pos", "upi", "qr", "otp",
            "kyc", "fir", "sms", "gps", "gsm", "lte", "4g", "5g", "rbi", "mha", "i4c", "ncrp"
        }

        candidates = []
        for pat in patterns:
            for match in re.finditer(pat, text):
                cand = match.group(1).strip()
                c_low = cand.lower()
                if c_low not in STOP_WORDS and len(cand) >= 3:
                    if victim_district and (victim_district.lower() in c_low or c_low in victim_district.lower()):
                        continue  # Law 1: Avoid picking victim's city as suspect zone
                    candidates.append(cand)

        for candidate in candidates:
            resolved = self.resolve(candidate)
            if resolved and resolved.get("lat") and resolved.get("lon"):
                key = candidate.lower()
                self._alias_map[key] = resolved
                return resolved

        return None

    def detect_telecom_zone(self, complaint):
        """
        Scans a complaint for location keywords, suspect bank IFSC codes,
        transaction hops, or telecom CDR markers, and returns resolved zone info.
        """
        if not complaint:
            return None

        # 1. Check for official RBI Bank IFSC code in suspect account, bank, narrative or hops
        searchable_strings = []
        if getattr(complaint, 'suspect_bank', None):
            searchable_strings.append(str(complaint.suspect_bank))
        if getattr(complaint, 'suspect_account_number', None):
            searchable_strings.append(str(complaint.suspect_account_number))
        if getattr(complaint, 'narrative_text', None):
            searchable_strings.append(str(complaint.narrative_text))
        if getattr(complaint, 'description', None):
            searchable_strings.append(str(complaint.description))

        try:
            for h in complaint.transaction_hops.all():
                if getattr(h, 'to_ifsc', None):
                    searchable_strings.append(str(h.to_ifsc))
                if getattr(h, 'from_ifsc', None):
                    searchable_strings.append(str(h.from_ifsc))
                if getattr(h, 'to_bank', None):
                    searchable_strings.append(str(h.to_bank))
                if getattr(h, 'location_name', None):
                    searchable_strings.append(str(h.location_name))
        except Exception:
            pass

        full_corpus = " ".join(searchable_strings)

        # Detect IFSC pattern: e.g. HDFC0000059, SBIN0000567, etc.
        ifsc_matches = re.findall(r'\b([A-Z]{4}0[A-Z0-9]{6})\b', full_corpus.upper())
        if ifsc_matches:
            from apps.complaints.rbi_directory import validate_ifsc
            for ifsc_candidate in ifsc_matches:
                ifsc_info = validate_ifsc(ifsc_candidate)
                if ifsc_info.get("is_valid") and ifsc_info.get("lat") and ifsc_info.get("lon"):
                    z_name = ifsc_info.get("city") or ifsc_info.get("district") or ifsc_info.get("branch")
                    return {
                        "name": z_name.title(),
                        "district": str(ifsc_info.get("district", z_name)).title(),
                        "state": str(ifsc_info.get("state", "India")).title(),
                        "lat": ifsc_info["lat"],
                        "lon": ifsc_info["lon"],
                        "source": f"RBI IFSC Directory ({ifsc_candidate})"
                    }

        # 2a. Contextual extraction from known Indian district catalog
        v_dist = getattr(complaint, 'victim_district', None)
        context_geo = self._extract_contextual_location(full_corpus, victim_district=v_dist)
        if context_geo:
            return context_geo

        # 2b. Universal NLP entity extraction for unknown/unimaginable locations across India
        unknown_geo = self._extract_unknown_candidate_entities(full_corpus, victim_district=v_dist)
        if unknown_geo:
            return unknown_geo

        # 3. Direct corpus resolve
        resolved = self.resolve(full_corpus)
        if resolved:
            return resolved

        # 4. Check suspect bank text only if it has geographic indicators (ignore generic bank acronyms)
        if getattr(complaint, 'suspect_bank', None):
            bank_str = str(complaint.suspect_bank).strip().lower()
            generic_bank_terms = {
                "sbi", "sbin", "hdfc", "icici", "axis", "pnb", "bob", "canara", 
                "bank", "kotak", "yes bank", "union bank", "state bank of india", 
                "punjab national bank", "bank of baroda", "central bank"
            }
            if bank_str not in generic_bank_terms and len(bank_str) > 3:
                bank_geo = self.resolve(str(complaint.suspect_bank))
                if bank_geo:
                    return bank_geo

        # 5. Otherwise fallback to victim district
        if v_dist:
            return self.resolve(v_dist)

        return None
