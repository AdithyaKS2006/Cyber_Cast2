"""
CrimeCast Fraud Feature Extractor v2.0
=======================================
Extracts the exact 22-dimensional feature vector specified in MODEL_PRD.md
and expected by LightGBM v2.0 (lgbm_model_v2.joblib).

Feature Groups:
  A. Core Spatial Signals (7):
     - fraud_method_encoded, victim_state_encoded, victim_district_encoded
     - beneficiary_bank_code, mule_account_age_days, hop_count, distance_from_victim_km
  B. IMEI & Device Intelligence (4):
     - imei_reuse_count, sim_activation_to_fraud_days
     - device_fingerprint_complaints, is_vpn_or_proxy_ip
  C. ATM & Withdrawal Profiling (3):
     - atm_terminal_repeat_count, withdrawal_amount_matches_atm_limit, atm_to_cashout_zone_distance_km
  D. Transaction Dynamics (8):
     - chain_duration_minutes, amount_split_ratio, cross_state_hops, new_account_ratio
     - nighttime_transfer_ratio, round_amount_ratio, festival_proximity, velocity_of_transfers
"""
import math
import datetime
import numpy as np
from django.utils import timezone

from apps.ml_engine.zones import ZONES, ZONE_BY_ID
from apps.ml_engine.imei_tracker import IMEITracker

FEATURE_COLS_V2 = [
    "fraud_method_encoded", "victim_state_encoded", "victim_district_encoded",
    "beneficiary_bank_code", "mule_account_age_days", "hop_count",
    "distance_from_victim_km",
    "imei_reuse_count", "sim_activation_to_fraud_days",
    "device_fingerprint_complaints", "is_vpn_or_proxy_ip",
    "atm_terminal_repeat_count", "withdrawal_amount_matches_atm_limit",
    "atm_to_cashout_zone_distance_km",
    "chain_duration_minutes", "amount_split_ratio", "cross_state_hops",
    "new_account_ratio", "nighttime_transfer_ratio", "round_amount_ratio",
    "festival_proximity", "velocity_of_transfers",
]

ATM_LIMITS = [10000, 20000, 25000, 50000, 100000]

class FraudFeatureExtractorV2:
    METHOD_MAP = {
        'UPI': 0, 'NET_BANKING': 1, 'CARD': 2,
        'PHONE_CALL': 3, 'CRYPTO': 4, 'OTHER': 5
    }

    def get_feature_names(self):
        return list(FEATURE_COLS_V2)

    def _haversine(self, lat1, lon1, lat2, lon2):
        if None in (lat1, lon1, lat2, lon2):
            return 0.0
        R = 6371.0  # Earth radius km
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi/2.0)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2.0)**2
        return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))

    def _find_zone(self, district_name):
        if not district_name:
            return ZONE_BY_ID.get(1, ZONES[0])
        district_lower = str(district_name).lower()
        for z in ZONES:
            if z['district'].lower() in district_lower or district_lower in z['district'].lower():
                return z
        return ZONE_BY_ID.get(1, ZONES[0])

    def extract(self, complaint, transaction_chain=None):
        """
        Extracts 22 features from Complaint model instance and its transaction hops.
        Returns a numpy array of shape (22,) with float32 values scaled to [0, 1].
        """
        f = {}
        hops = list(transaction_chain) if transaction_chain else []

        complaint_ts = getattr(complaint, 'complaint_timestamp', None) or timezone.now()
        fraud_ts = getattr(complaint, 'fraud_timestamp', None) or complaint_ts

        # ── Group A: Core Signals ──────────────────────────────────────────
        method_str = str(getattr(complaint, 'fraud_method', 'UPI')).upper()
        method_id  = self.METHOD_MAP.get(method_str, 0)
        f['fraud_method_encoded'] = float(method_id) / 5.0

        geo = self._find_zone(getattr(complaint, 'victim_district', ''))
        unique_states = sorted(list(set(z['state'] for z in ZONES)))
        state_name    = getattr(complaint, 'victim_state', '') or geo['state']
        state_idx     = unique_states.index(state_name) if state_name in unique_states else 0
        f['victim_state_encoded'] = float(state_idx) / max(1.0, float(len(unique_states) - 1))

        v_lon = float(getattr(complaint, 'victim_lon', None) or geo['lon'])
        f['victim_district_encoded'] = float(int((v_lon - 68.0) / 30.0 * 766.0) % 766) / 766.0

        # Beneficiary bank code
        last_to_bank = ''
        if hops:
            last_to_bank = str(getattr(hops[-1], 'to_bank', '') or '').upper().strip()
        elif getattr(complaint, 'suspect_bank', None):
            last_to_bank = str(complaint.suspect_bank).upper().strip()
        bank_hash = sum(ord(c) for c in last_to_bank[:4]) if last_to_bank else 7
        f['beneficiary_bank_code'] = float(bank_hash % 28) / 27.0

        # Mule account age
        last_mule_age = 5.0  # Default fresh mule (Law 2)
        if hops:
            for h in reversed(hops):
                age = getattr(h, 'account_age_days', getattr(h, 'mule_account_age_days', None))
                if age is not None:
                    last_mule_age = float(age)
                    break
        f['mule_account_age_days'] = float(np.clip(last_mule_age, 1.0, 90.0)) / 90.0

        # Hop count
        hop_count = len(hops) if hops else 4
        f['hop_count'] = float(np.clip(hop_count, 1, 8)) / 8.0

        # Distance from victim
        if hops and getattr(hops[-1], 'latitude', None) and getattr(hops[-1], 'longitude', None):
            dist_km = self._haversine(geo['lat'], geo['lon'], float(hops[-1].latitude), float(hops[-1].longitude))
        else:
            dist_km = 1200.0  # Empirical average separation (Law 1)
        f['distance_from_victim_km'] = float(np.clip(dist_km, 1.0, 3000.0)) / 3000.0

        # ── Group B: IMEI & Device Intelligence ────────────────────────────
        device_sig = IMEITracker.get_device_signals(complaint)
        f['imei_reuse_count']              = device_sig['imei_reuse_count_norm']
        f['sim_activation_to_fraud_days']  = device_sig['sim_activation_to_fraud_days_norm']
        f['device_fingerprint_complaints'] = device_sig['device_fingerprint_complaints_norm']
        f['is_vpn_or_proxy_ip']            = device_sig['is_vpn_or_proxy_ip']

        # ── Group C: ATM & Withdrawal Profiling ────────────────────────────
        atm_repeat = 1
        withdrawal_is_round = 0.0
        fraud_amt = float(getattr(complaint, 'fraud_amount', 0.0) or 0.0)

        # Check if amount matches standard ATM withdrawal denomination
        if any(abs(fraud_amt - limit) < 1.0 or (fraud_amt > 0 and (fraud_amt % 10000) == 0) for limit in ATM_LIMITS):
            withdrawal_is_round = 1.0

        f['atm_terminal_repeat_count']         = float(atm_repeat) / 6.0
        f['withdrawal_amount_matches_atm_limit'] = withdrawal_is_round
        f['atm_to_cashout_zone_distance_km']   = 6.0 / 50.0  # Empirical average ATM distance from zone cluster

        # ── Group D: Transaction Dynamics ──────────────────────────────────
        if hops and len(hops) > 1:
            first_ts = getattr(hops[0], 'timestamp', fraud_ts) or fraud_ts
            last_ts  = getattr(hops[-1], 'timestamp', fraud_ts) or fraud_ts
            chain_dur = max(5.0, (last_ts - first_ts).total_seconds() / 60.0)
            elapsed_hours = max(0.1, chain_dur / 60.0)
            velocity = min(10.0, float(len(hops)) / elapsed_hours)
        else:
            chain_dur = 45.0  # Standard 45-minute chain (Law 3)
            velocity  = 4.0

        f['chain_duration_minutes'] = float(np.clip(chain_dur, 10.0, 480.0)) / 480.0
        f['velocity_of_transfers']  = float(np.clip(velocity, 0.0, 10.0)) / 10.0

        total_chain_amt = sum(float(getattr(h, 'amount', 0.0)) for h in hops) if hops else fraud_amt
        split_ratio = (total_chain_amt / fraud_amt) if fraud_amt > 0 else 0.85
        f['amount_split_ratio'] = float(np.clip(split_ratio, 0.0, 1.0))

        # Cross state hops
        unique_hop_states = set()
        for h in hops:
            h_dist = getattr(h, 'district', None)
            if h_dist:
                unique_hop_states.add(self._find_zone(h_dist)['state'])
        cross_state = max(1, len(unique_hop_states) - 1) if unique_hop_states else 2
        f['cross_state_hops'] = float(np.clip(cross_state, 0, 4)) / 4.0

        # Fresh account and round ratio
        if hops:
            new_cnt = sum(1 for h in hops if float(getattr(h, 'account_age_days', 10) or 10) <= 30)
            f['new_account_ratio'] = float(new_cnt) / float(len(hops))
            round_cnt = sum(1 for h in hops if (float(getattr(h, 'amount', 0.0)) % 1000) == 0)
            f['round_amount_ratio'] = float(round_cnt) / float(len(hops))
        else:
            f['new_account_ratio']   = 0.85
            f['round_amount_ratio'] = 0.70

        # Night transfer ratio
        if hops:
            night_cnt = sum(1 for h in hops if (getattr(h, 'timestamp', fraud_ts) or fraud_ts).hour >= 22 or (getattr(h, 'timestamp', fraud_ts) or fraud_ts).hour <= 6)
            f['nighttime_transfer_ratio'] = float(night_cnt) / float(len(hops))
        else:
            h = fraud_ts.hour if hasattr(fraud_ts, 'hour') else 23
            f['nighttime_transfer_ratio'] = 1.0 if (h >= 22 or h <= 6) else 0.4

        # Festival proximity
        today = datetime.date.today()
        FESTIVAL_DATES = [
            datetime.date(today.year, m, d)
            for m, d in [(1, 26), (3, 25), (8, 15), (10, 2), (10, 20), (10, 29), (11, 5), (12, 25)]
        ]
        days_to_fest = min(abs((today - d).days) for d in FESTIVAL_DATES)
        f['festival_proximity'] = float(max(0.0, 1.0 - days_to_fest / 30.0))

        # Build ordered vector
        vector = [float(f.get(col, 0.0)) for col in FEATURE_COLS_V2]
        return np.array(vector, dtype=np.float32)
