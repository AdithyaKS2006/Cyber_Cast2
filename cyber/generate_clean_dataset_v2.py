"""
CrimeCast Synthetic Data Generator v2.0 — Real-World Mirroring Edition
=======================================================================
Implements all 4 Real-World Laws defined in MODEL_PRD.md:

  Law 1 — Victim-Scammer Geographic Separation:
      Victim location is sampled independently from ANYWHERE in India.
      Cash-out zone is sampled from NCRB hotspot weights.
      There is NO mathematical link between victim and cash-out location.

  Law 2 — Mule Account Lifecycle (10-day rule):
      60% of mule accounts are 1-10 days old (fresh throwaway accounts).
      25% are 11-30 days old. Only 15% are 31-90 days.
      No mule accounts older than 90 days (unrealistic for active mules).

  Law 3 — Transfer Velocity (money moves in under 4 hours):
      40% of chains complete in 10-60 minutes.
      35% in 60-180 minutes. Only 5% take 4-8 hours.
      No chains exceeding 8 hours (RBI NACH settlement makes freeze impossible).

  Law 4 — Method-Specific Fraud Amount:
      UPI: Rs5K-1L, Card: Rs1K-50K, NetBanking: Rs50K-20L, Phone: Rs10K-5L

New in v2.0: 4 IMEI/Device features + 3 ATM/Withdrawal features added.
Total features: 22 (up from 38 bloated synthetic features in v1.0).
Total samples: 150,000 (up from 55,000).
"""

import sys
import os
import json
from pathlib import Path
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import math

BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / 'dataset'
DATASET_DIR.mkdir(parents=True, exist_ok=True)

sys.path.append(str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crimecast.settings.development')

import django
try:
    django.setup()
except Exception:
    pass

from apps.ml_engine.zones import ZONES, ZONE_BY_ID

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
NUM_SAMPLES   = 150000
RANDOM_STATE  = 42
NUM_ZONES     = len(ZONES)

# Feature columns for v2.0 — 22 features total
FEATURE_COLS_V2 = [
    # Group A — Core Signal Features (7)
    "fraud_method_encoded",
    "victim_state_encoded",
    "victim_district_encoded",
    "beneficiary_bank_code",
    "mule_account_age_days",
    "hop_count",
    "distance_from_victim_km",
    # Group B — IMEI & Device Features (4)
    "imei_reuse_count",
    "sim_activation_to_fraud_days",
    "device_fingerprint_complaints",
    "is_vpn_or_proxy_ip",
    # Group C — ATM & Withdrawal Features (3)
    "atm_terminal_repeat_count",
    "withdrawal_amount_matches_atm_limit",
    "atm_to_cashout_zone_distance_km",
    # Group D — Transaction Features (8, fixed distributions)
    "chain_duration_minutes",
    "amount_split_ratio",
    "cross_state_hops",
    "new_account_ratio",
    "nighttime_transfer_ratio",
    "round_amount_ratio",
    "festival_proximity",
    "velocity_of_transfers",
]

METHOD_MAP = {0: "UPI", 1: "NET_BANKING", 2: "CARD", 3: "PHONE_CALL", 4: "CRYPTO", 5: "AEPS"}

# ─────────────────────────────────────────────────────────────────────────────
# NCRB hotspot zone weights (published telemetry 2022-2024)
# ─────────────────────────────────────────────────────────────────────────────
NCRB_ZONE_WEIGHTS = {
    "Nuh":          0.095,
    "Jamtara":      0.090,
    "Bharatpur":    0.085,
    "Deoghar":      0.080,
    "Giridih":      0.080,
    "Alwar":        0.080,
    "Mathura":      0.075,
    "New Delhi":    0.070,
    "Mumbai":       0.065,
    "Bengaluru":    0.060,
    "Hyderabad":    0.060,
}

# Mule Belt Zone IDs (East + North cyber corridors)
MULE_BELT_ZONE_NAMES = {
    "Jamtara", "Deoghar", "Giridih", "Dhanbad",  # Jharkhand Santhal Pargana belt
    "Nuh", "Faridabad",                             # Haryana Mewat belt
    "Bharatpur", "Alwar",                          # Rajasthan Mewat extension
    "Mathura", "Agra",                             # UP border belt
}

# VPN usage rates by fraud method
VPN_RATE_BY_METHOD = {0: 0.15, 1: 0.45, 2: 0.20, 3: 0.05, 4: 0.65, 5: 0.05}

# ATM round-number limits in INR
ATM_LIMITS = [10000, 20000, 25000, 50000, 100000]

# ─────────────────────────────────────────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────
def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km between two lat/lon points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def build_zone_probability_vector():
    """Build normalized probability vector over 40 zones using NCRB weights."""
    weights = np.zeros(NUM_ZONES)
    for idx, z in enumerate(ZONES):
        name = z["zone_name"]
        if name in NCRB_ZONE_WEIGHTS:
            weights[idx] = NCRB_ZONE_WEIGHTS[name]
        else:
            # Remaining zones share the leftover weight proportionally
            weights[idx] = z.get("hotspot_weight", 1.0) * 0.005
    total = weights.sum()
    return weights / total


def sample_mule_account_age(rng):
    """Law 2: 10-day mule lifecycle rule."""
    r = rng.random()
    if r < 0.60:
        return rng.randint(1, 10)     # Fresh throwaway mule (most common)
    elif r < 0.85:
        return rng.randint(11, 30)    # Reused mule
    else:
        return rng.randint(31, 90)    # Trusted long-standing mule (rare)


def sample_chain_duration(rng):
    """Law 3: Transfer velocity — money moves fast."""
    r = rng.random()
    if r < 0.40:
        return rng.uniform(10, 60)    # Immediate liquidation
    elif r < 0.75:
        return rng.uniform(60, 180)   # Standard mule chain
    elif r < 0.95:
        return rng.uniform(180, 240)  # Complex multi-state chain
    else:
        return rng.uniform(240, 480)  # Slow corporate fraud


def sample_fraud_amount(rng, method_id):
    """Law 4: Method-specific fraud amount based on platform limits."""
    ranges = {
        0: (5000,    100000),    # UPI — daily limit Rs1L
        1: (50000,   2000000),   # NetBanking — corporate NEFT/RTGS
        2: (1000,    50000),     # Card — transaction limits
        3: (10000,   500000),    # Phone Call — varies widely
        4: (25000,   5000000),   # Crypto — high value off-ledger
        5: (500,     10000),     # AEPS — Aadhaar micro-withdrawals
    }
    low, high = ranges.get(method_id, (5000, 100000))
    return rng.uniform(low, high)


def sample_imei_reuse_count(rng, is_mule_zone):
    """Mule phones reuse IMEI across multiple SIMs."""
    if is_mule_zone:
        r = rng.random()
        if r < 0.30:
            return 1                          # Careful criminal, uses one SIM
        elif r < 0.55:
            return 2                          # Moderate reuse
        elif r < 0.80:
            return rng.randint(3, 5)          # Syndicate mule phone
        else:
            return rng.randint(6, 12)         # High-volume operation
    else:
        r = rng.random()
        if r < 0.75:
            return 1                          # Normal user (innocent)
        elif r < 0.92:
            return 2                          # Slightly suspicious
        else:
            return rng.randint(3, 6)          # Urban mule


def sample_sim_to_fraud_days(rng, is_mule_zone):
    """How many days between SIM activation and the fraud event."""
    if is_mule_zone:
        r = rng.random()
        if r < 0.65:
            return rng.randint(1, 7)          # Discard SIM after crime (most common)
        elif r < 0.90:
            return rng.randint(8, 20)
        else:
            return rng.randint(21, 45)
    else:
        return rng.randint(7, 180)            # Metro frauds use older SIMs


def sample_device_fingerprint_complaints(rng, imei_reuse_count):
    """Number of distinct complaints linked to the same device."""
    if imei_reuse_count >= 6:
        return rng.randint(4, 15)     # Confirmed syndicate device
    elif imei_reuse_count >= 3:
        return rng.randint(2, 5)      # Suspicious device
    elif imei_reuse_count == 2:
        return rng.randint(1, 3)
    else:
        return 1                      # Single-use device


def is_festival_month(month):
    """Returns proximity score — fraud spikes 3x during festival season."""
    FESTIVAL_MONTHS = {10: 1.0, 11: 0.9, 3: 0.6, 8: 0.5, 1: 0.4}
    return FESTIVAL_MONTHS.get(month, 0.1)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN GENERATOR
# ─────────────────────────────────────────────────────────────────────────────
def generate_v2_dataset(n=NUM_SAMPLES, seed=RANDOM_STATE):
    rng = np.random.RandomState(seed)
    rng_py = __import__('random').Random(seed)  # for non-numpy random usage

    zone_probs = build_zone_probability_vector()

    # Simulation window: NCRB 2022-2024 (730 days), festival-weighted
    start_date = datetime(2022, 1, 1)
    # Generate a large pool (10x) so we always have enough festival-month dates
    # Oct + Nov = 61/730 days = ~8.4% of total. We need ~35% festival dates.
    # To guarantee enough, we generate 10x pool and sample with replacement if needed.
    pool_size = n * 10
    raw_minutes = rng.randint(0, 730 * 24 * 60, size=pool_size)
    sim_dates_all = [start_date + timedelta(minutes=int(m)) for m in raw_minutes]

    festival_dates = [d for d in sim_dates_all if d.month in (10, 11)]
    other_dates    = [d for d in sim_dates_all if d.month not in (10, 11)]

    target_festival = int(n * 0.25)   # 25% in festival months (achievable with 10x pool)
    target_other    = n - target_festival

    # Safe sampling — cap at what is available
    selected_festival = festival_dates[:min(target_festival, len(festival_dates))]
    selected_other    = other_dates[:min(target_other, len(other_dates))]

    sim_dates = selected_festival + selected_other
    # Pad to exactly n if still short (extremely rare)
    while len(sim_dates) < n:
        sim_dates.append(start_date + timedelta(days=int(rng.randint(0, 730))))

    rng_py.shuffle(sim_dates)
    sim_dates = sorted(sim_dates[:n])

    # ── Step 1: Sample target cash-out zone (LAW 1 — independent of victim) ──
    # Guarantee at least one sample per zone for stratified coverage
    y = np.zeros(n, dtype=int)
    for i in range(NUM_ZONES):
        y[i] = i
    for i in range(NUM_ZONES, n):
        y[i] = rng.choice(NUM_ZONES, p=zone_probs)

    # ── Step 2: Build feature array ──────────────────────────────────────────
    rows = []
    for i in range(n):
        zone_idx = int(y[i])
        z_info   = ZONES[zone_idx]
        z_name   = z_info["zone_name"]
        z_lat    = z_info["lat"]
        z_lon    = z_info["lon"]
        is_mule  = z_name in MULE_BELT_ZONE_NAMES
        date     = sim_dates[i]
        month    = date.month

        # ── Fraud method (conditional on zone type)
        if is_mule:
            # East/North belt: overwhelmingly UPI vishing
            method_id = rng.choice(6, p=[0.65, 0.10, 0.10, 0.10, 0.03, 0.02])
        else:
            # Metro zones: mixed methods
            method_id = rng.choice(6, p=[0.35, 0.30, 0.20, 0.08, 0.05, 0.02])

        # ── Law 4: Method-specific fraud amount
        fraud_amount = sample_fraud_amount(rng, method_id)

        # ── Law 1: Victim location is INDEPENDENT of cash-out zone
        # Victim is sampled from ANYWHERE in India
        victim_lat = rng.uniform(8.5, 36.5)
        victim_lon = rng.uniform(68.5, 97.4)

        # State/district encoding from victim lat/lon (not from cash-out zone)
        victim_state_enc = float(int((victim_lat - 8.0) / 29.0 * 36.0) % 36) / 36.0
        victim_dist_enc  = float(int((victim_lon - 68.0) / 30.0 * 766.0) % 766) / 766.0

        # Distance from victim to cash-out zone (will be large due to Law 1)
        dist_km = haversine_km(victim_lat, victim_lon, z_lat, z_lon)

        # ── Law 2: Mule account age
        mule_age = sample_mule_account_age(rng)

        # ── Hop count — 3-8, Poisson-distributed around mean 4.5
        hop_count = int(np.clip(rng.poisson(4.5), 3, 8))

        # ── Bank code — public sector preferred in mule belts
        if is_mule:
            bank_code = rng.choice(np.arange(28), p=[0.25, 0.25] + [0.50/26]*26)
        else:
            bank_code = rng.choice(np.arange(28), p=[0.05, 0.05, 0.20, 0.20, 0.10] + [0.40/23]*23)

        # ── Group B: IMEI & Device Features
        imei_reuse   = sample_imei_reuse_count(rng, is_mule)
        sim_to_fraud = sample_sim_to_fraud_days(rng, is_mule)
        dev_complaints = sample_device_fingerprint_complaints(rng, imei_reuse)
        is_vpn       = 1.0 if rng.random() < VPN_RATE_BY_METHOD.get(method_id, 0.15) else 0.0

        # ── Group C: ATM & Withdrawal Features
        # ATM terminal repeat count — mule belts have hotspot ATMs
        if is_mule:
            atm_repeat = rng.choice([1, 2, 3, 4, 5, 6], p=[0.20, 0.25, 0.25, 0.15, 0.10, 0.05])
        else:
            atm_repeat = rng.choice([1, 2, 3], p=[0.70, 0.20, 0.10])

        # 70% of mule ATM withdrawals use exact ATM denomination limits
        withdrawal_is_round = 1.0 if rng.random() < 0.70 else 0.0

        # ATM distance from zone center (in km) — should be small (<15km) for correct predictions
        atm_dist_km = rng.exponential(scale=6.0)  # Most ATMs within 10-15km of zone center

        # ── Law 3: Chain duration
        chain_dur = sample_chain_duration(rng)

        # ── Group D: Transaction features (realistic distributions)
        # Amount split ratio — 80% of mule chains split
        amount_split = rng.beta(4, 2) if is_mule else rng.beta(2, 5)

        # Cross-state hops — mule belt always crosses states
        cross_state = rng.randint(1, 4) if is_mule else rng.randint(0, 3)

        # New account ratio — most accounts in chain are fresh
        new_acc_ratio = rng.beta(6, 2) if is_mule else rng.beta(2, 4)

        # Nighttime transfer — 55% of frauds happen at night
        night_ratio = rng.beta(3, 3)

        # Round amount ratio — 70% of mule transfers use round numbers
        round_ratio = rng.beta(5, 2) if is_mule else rng.beta(2, 5)

        # Festival proximity score
        festival_score = is_festival_month(month)

        # Transfer velocity — hops per hour
        velocity = float(hop_count) / max(0.1, chain_dur / 60.0)
        velocity = min(10.0, velocity)  # cap at 10 hops/hour

        row = {
            # Group A
            "fraud_method_encoded":          float(method_id) / 5.0,
            "victim_state_encoded":          victim_state_enc,
            "victim_district_encoded":       victim_dist_enc,
            "beneficiary_bank_code":         float(bank_code) / 27.0,
            "mule_account_age_days":         float(mule_age) / 90.0,
            "hop_count":                     float(hop_count) / 8.0,
            "distance_from_victim_km":       float(np.clip(dist_km, 1, 3000)) / 3000.0,
            # Group B
            "imei_reuse_count":              float(np.clip(imei_reuse, 1, 12)) / 12.0,
            "sim_activation_to_fraud_days":  float(np.clip(sim_to_fraud, 1, 180)) / 180.0,
            "device_fingerprint_complaints": float(np.clip(dev_complaints, 1, 15)) / 15.0,
            "is_vpn_or_proxy_ip":            float(is_vpn),
            # Group C
            "atm_terminal_repeat_count":     float(np.clip(atm_repeat, 1, 6)) / 6.0,
            "withdrawal_amount_matches_atm_limit": float(withdrawal_is_round),
            "atm_to_cashout_zone_distance_km": float(np.clip(atm_dist_km, 0.1, 50)) / 50.0,
            # Group D
            "chain_duration_minutes":        float(np.clip(chain_dur, 10, 480)) / 480.0,
            "amount_split_ratio":            float(np.clip(amount_split, 0, 1)),
            "cross_state_hops":              float(np.clip(cross_state, 0, 4)) / 4.0,
            "new_account_ratio":             float(np.clip(new_acc_ratio, 0, 1)),
            "nighttime_transfer_ratio":      float(np.clip(night_ratio, 0, 1)),
            "round_amount_ratio":            float(np.clip(round_ratio, 0, 1)),
            "festival_proximity":            float(festival_score),
            "velocity_of_transfers":         float(np.clip(velocity, 0, 10)) / 10.0,
            # Metadata
            "target_zone":                   zone_idx,
            "zone_name":                     z_name,
            "fraud_method_label":            METHOD_MAP[method_id],
            "fraud_amount_inr":              round(fraud_amount, 2),
            "sim_date":                      date.strftime('%Y-%m-%d %H:%M:%S'),
        }
        rows.append(row)

    df = pd.DataFrame(rows)

    # Verify column order matches FEATURE_COLS_V2
    feature_df = df[FEATURE_COLS_V2]
    feature_df = feature_df.copy()
    feature_df["target_zone"]       = df["target_zone"].values
    feature_df["zone_name"]         = df["zone_name"].values
    feature_df["fraud_method_label"] = df["fraud_method_label"].values
    feature_df["fraud_amount_inr"]  = df["fraud_amount_inr"].values
    feature_df["sim_date"]          = df["sim_date"].values

    return feature_df, FEATURE_COLS_V2


def main():
    print("=" * 65)
    print("  CrimeCast Synthetic Data Generator v2.0 — Real-World Mirror")
    print("=" * 65)
    print(f"  Generating {NUM_SAMPLES:,} samples across {NUM_ZONES} zones...")
    print(f"  Implementing all 4 Real-World Laws from MODEL_PRD.md\n")

    df, feature_cols = generate_v2_dataset(NUM_SAMPLES, RANDOM_STATE)

    # Quick Law validation summary
    mule_age_vals = df["mule_account_age_days"].values * 90
    fresh_mule_pct = float(np.mean(mule_age_vals <= 10)) * 100

    chain_dur_vals = df["chain_duration_minutes"].values * 480
    fast_chain_pct = float(np.mean(chain_dur_vals <= 240)) * 100

    # Compute average victim-to-cashout distance
    avg_dist = float(df["distance_from_victim_km"].values.mean()) * 3000

    print("  Law Compliance Validation:")
    print(f"  [Law 1] Average victim-to-cashout distance : {avg_dist:.0f} km  (target: >500km)")
    print(f"  [Law 2] Mule accounts aged <=10 days       : {fresh_mule_pct:.1f}%  (target: ~60%)")
    print(f"  [Law 3] Chains completing in <=4 hours     : {fast_chain_pct:.1f}%  (target: ~95%)")
    print(f"  [Law 4] Method-specific amounts            : OK (hardcoded ranges per method)")

    imei_multi = float(np.mean(df["imei_reuse_count"].values * 12 >= 3)) * 100
    print(f"\n  IMEI reuse >= 3 SIMs (mule device signals) : {imei_multi:.1f}% of samples")

    csv_path = DATASET_DIR / 'fraud_data_clean_v2.csv'
    df.to_csv(csv_path, index=False)

    print(f"\n  Dataset saved: {csv_path}")
    print(f"  Shape: {df.shape[0]:,} rows x {df.shape[1]} columns")
    print(f"  Feature columns: {len(feature_cols)}")
    print("\n  Next step: python train_cashout_model_v2.py")
    print("=" * 65)


if __name__ == '__main__':
    main()
