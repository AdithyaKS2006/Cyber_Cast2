# CrimeCast ML Engine — Model Training PRD (Product Requirements Document)
## Version 2.0 — Train From Scratch with Real-World Mirroring

**Document Status:** ACTIVE  
**Written For:** CrimeCast SIH 2026 / Production ML Pipeline  
**Current Baseline Accuracy (v1.0):** Top-5: 92.36% on synthetic data | Expected on real complaints: ~45–55%  
**Target Accuracy (v2.0):** Top-5: 75–85% on real complaints  

---

## Table of Contents
1. [The Problem With v1.0 Data](#1-the-problem-with-v10-data)
2. [The 4 Real-World Laws That Must Be Baked Into Synthetic Data](#2-the-4-real-world-laws)
3. [Full Feature List — All 22 Training Features](#3-full-feature-list)
4. [Synthetic Data Generation Rules — Complete Specification](#4-synthetic-data-generation-rules)
5. [Training Pipeline — Step by Step](#5-training-pipeline)
6. [Model Architecture](#6-model-architecture)
7. [How to Reach Real-World Accuracy — Active Learning Loop](#7-active-learning-loop)
8. [Accuracy Milestones & Targets](#8-accuracy-milestones)
9. [What You Need From External APIs](#9-external-apis)
10. [Files to Create / Modify](#10-files-to-create)

---

## 1. The Problem With v1.0 Data

The current generate_clean_dataset.py generates 55,000 records but contains 4 critical flaws that make it unrealistic:

| Flaw | What v1.0 Does | What Real Life Looks Like |
|:---|:---|:---|
| Victim Location | Victim placed 100-200km from cash-out zone | Victim is ANYWHERE in India (avg 1200km from cash-out) |
| Mule Account Age | Exponential distribution — many accounts 60-180 days old | 90% of mule accounts are under 30 days old at time of fraud |
| Transfer Chain Duration | Random up to 48 hours | Real chains complete in under 4 hours before RBI settlement |
| Fraud Amount by Method | Single distribution for all methods | UPI: Rs5K-1L, Card: Rs1K-50K, NetBanking: Rs50K-20L |

These 4 flaws mean the model learns fake patterns that do not exist in real police complaint data.

---

## 2. The 4 Real-World Laws

These are non-negotiable rules that the synthetic data generator MUST follow.

### Law 1 — The Victim-Scammer Geographic Separation Law

RULE: Victim location and cash-out location are INDEPENDENT.
      Scammers specifically operate far from victims to avoid local police.

IMPLEMENTATION:
  - Victim lat/lon: sampled from ANY point in India (8.5N-37N, 68E-97E)
  - Cash-out zone: sampled from NCRB hotspot weights (Jamtara 9%, Nuh 9.5%, etc.)
  - There is NO mathematical link between victim location and cash-out zone
  - Exception: 5% of cases where local crime bosses operate in victim's city (metro frauds)

### Law 2 — The Mule Account Lifecycle Law

RULE: Real mule accounts follow a strict 10-day lifecycle.

IMPLEMENTATION:
  Day 0:  Criminal buys new SIM card
  Day 1:  Opens bank account with new SIM (min KYC — Jan Dhan, digital banks)
  Day 3-5: Receives stolen money
  Day 5-8: Withdraws cash at ATM
  Day 10+: Account frozen or abandoned

  mule_account_age_days distribution:
    - 60% of cases: 1-10 days (fresh mule)
    - 25% of cases: 11-30 days (reused mule)
    - 15% of cases: 31-90 days (old trusted mule, rare)
    - 0% of cases: >90 days (not realistic for active mule accounts)

### Law 3 — The Transfer Velocity Law

RULE: Money moves FAST. The entire hop chain completes in under 4 hours.

IMPLEMENTATION:
  chain_duration_minutes distribution:
    - 40% of cases: 10-60 minutes (immediate liquidation)
    - 35% of cases: 60-180 minutes (standard mule chain)
    - 20% of cases: 180-240 minutes (complex multi-state chains)
    - 5% of cases: 240-480 minutes (large corporate frauds, slower)
    - 0% of cases: >8 hours (RBI NACH settlement makes freeze impossible)

  Each individual hop: 3-25 minutes apart
  Total hops: 3-8 (not random 2-12)

### Law 4 — The Method-Specific Amount Law

RULE: Each fraud type has a characteristic amount range tied to platform limits.

IMPLEMENTATION:
  UPI fraud:         Rs5,000   - Rs1,00,000  (UPI daily limit = Rs1L)
  Card fraud:        Rs1,000   - Rs50,000    (card transaction limits)
  Net Banking:       Rs50,000  - Rs20,00,000 (corporate NEFT/RTGS)
  Phone Call scam:   Rs10,000  - Rs5,00,000  (varies widely)
  Crypto:            Rs25,000  - Rs50,00,000 (high-value off-ledger)
  AEPS/Other:        Rs500     - Rs10,000    (Aadhaar-enabled micro-withdrawals)

---

## 3. Full Feature List — All 22 Training Features

### Group A — Core Signal Features (7) [LOAD-BEARING — DO NOT REMOVE]

| # | Feature Name | Description | How to Generate Synthetically |
|:--|:---|:---|:---|
| 1 | fraud_method_encoded | Type of fraud: UPI/Card/NetBanking/Phone/Crypto | Weighted by RBI NPCI shares (UPI=45%) |
| 2 | victim_state_encoded | Which Indian state the victim is in | Uniform across all 28 states + 8 UTs |
| 3 | victim_district_encoded | Which district the victim is in | Uniform across 766 districts |
| 4 | beneficiary_bank_code | Which bank received stolen money | Weighted: Public sector 60%, Private 40% |
| 5 | mule_account_age_days | How old is the receiving bank account | Law 2 distribution above |
| 6 | hop_count | How many times money jumped between accounts | 3-8 hops, Poisson distribution (mean=4.5) |
| 7 | distance_from_victim_km | Distance between victim and cash-out zone | Law 1: completely independent, avg 800-1500km |

### Group B — New IMEI & Device Features (4) [NEW IN v2.0]

| # | Feature Name | Description | How to Generate Synthetically |
|:--|:---|:---|:---|
| 8 | imei_reuse_count | How many SIMs have used this phone's IMEI | Normal=1, Mules=3-8 (power law) |
| 9 | sim_activation_to_fraud_days | Days between SIM activation and fraud | Mule SIMs: 1-7 days (80%), Normal: 30-365 |
| 10 | device_fingerprint_complaints | How many complaints involve same device | 1=innocent, 2-3=suspicious, 4+=confirmed mule |
| 11 | is_vpn_or_proxy_ip | Was fraud made from a VPN/proxy IP | 40% of hackers use VPN (binary: 0 or 1) |

### Group C — ATM & Withdrawal Features (3) [NEW IN v2.0]

| # | Feature Name | Description | How to Generate Synthetically |
|:--|:---|:---|:---|
| 12 | atm_terminal_repeat_count | How many fraud cases withdrew from same ATM | 1-2=normal, 3+=targeted ATM |
| 13 | withdrawal_amount_matches_atm_limit | Is withdrawal exactly Rs10K/20K/50K/1L? | 70% of mule ATM withdrawals = exact ATM limit |
| 14 | atm_to_cashout_zone_distance_km | Distance of ATM from predicted zone center | Should be <15km if prediction is correct |

### Group D — Existing Transaction Features (8) [KEEP — FIX DISTRIBUTIONS]

| # | Feature Name | Description | Fix for v2.0 |
|:--|:---|:---|:---|
| 15 | chain_duration_minutes | Total time money was moving | Use Law 3 distribution |
| 16 | amount_split_ratio | Was stolen amount split across multiple accounts | 80% of mule chains split to avoid detection |
| 17 | cross_state_hops | Did money jump across state borders | East/North belt frauds: always YES |
| 18 | new_account_ratio | Fraction of accounts under 30 days old | Should be 0.7-1.0 for real mule chains |
| 19 | nighttime_transfer_ratio | Were transfers done between 10PM-6AM | 55% of frauds happen at night |
| 20 | round_amount_ratio | Are transfer amounts round numbers | 70% of mule withdrawals are round |
| 21 | festival_proximity | How close to a major Indian festival | Fraud spikes 3x during Diwali/Dussehra |
| 22 | velocity_of_transfers | Number of hops per hour | Real chains: 2-4 hops/hour |

---

## 4. Synthetic Data Generation Rules — Complete Specification

### 4.1 Sample Size & Random State

    NUM_SAMPLES = 150000   # Increased from 55K to 150K for better coverage
    RANDOM_STATE = 42
    NUM_ZONES = 40

### 4.2 Target Zone Assignment (Cash-Out Location)

    # Based on NCRB 2022-2024 published hotspot weights
    # DO NOT link this to victim location
    HOTSPOT_WEIGHTS = {
        "Nuh": 0.095,
        "Jamtara": 0.090,
        "Bharatpur": 0.085,
        "Deoghar": 0.080,
        "Giridih": 0.080,
        "Alwar": 0.080,
        "Mathura": 0.075,
        "New Delhi": 0.070,
        "Mumbai": 0.065,
        "Bengaluru": 0.060,
        "Hyderabad": 0.060,
        # remaining 29 zones share remaining 16%
    }

### 4.3 Victim Location — LAW 1 Implementation

    # Victim is sampled ANYWHERE in India, INDEPENDENT of cash-out zone
    victim_lat = rng.uniform(8.5, 36.5)     # All of India, north to south
    victim_lon = rng.uniform(68.5, 97.4)    # All of India, west to east

    # Distance from victim to cash-out zone will naturally become large (800-2000km)
    # This is the CORRECT behavior

### 4.4 Mule Account Age — LAW 2 Implementation

    r = rng.random()
    if r < 0.60:
        mule_account_age = rng.randint(1, 10)     # Fresh mule (most common)
    elif r < 0.85:
        mule_account_age = rng.randint(11, 30)    # Reused mule
    else:
        mule_account_age = rng.randint(31, 90)    # Trusted older mule (rare)

### 4.5 Transfer Chain Duration — LAW 3 Implementation

    r = rng.random()
    if r < 0.40:
        chain_duration_minutes = rng.uniform(10, 60)    # Immediate liquidation
    elif r < 0.75:
        chain_duration_minutes = rng.uniform(60, 180)   # Standard chain
    elif r < 0.95:
        chain_duration_minutes = rng.uniform(180, 240)  # Complex chain
    else:
        chain_duration_minutes = rng.uniform(240, 480)  # Slow corporate fraud

### 4.6 Fraud Amount by Method — LAW 4 Implementation

    AMOUNT_BY_METHOD = {
        'UPI':         (5000,    100000),
        'CARD':        (1000,    50000),
        'NET_BANKING': (50000,   2000000),
        'PHONE_CALL':  (10000,   500000),
        'CRYPTO':      (25000,   5000000),
        'AEPS':        (500,     10000),
    }
    low, high = AMOUNT_BY_METHOD[method]
    fraud_amount = rng.uniform(low, high)

### 4.7 IMEI Reuse Count (New Feature)

    r = rng.random()
    if r < 0.55:
        imei_reuse_count = 1                        # Innocent user
    elif r < 0.75:
        imei_reuse_count = 2                        # Mildly suspicious
    elif r < 0.90:
        imei_reuse_count = rng.randint(3, 5)        # Mule phone
    else:
        imei_reuse_count = rng.randint(6, 12)       # Confirmed syndicate device

### 4.8 SIM Activation to Fraud Days (New Feature)

    # For East/North belt zones (Jamtara, Nuh, Bharatpur etc.)
    if target_zone in MULE_BELT_ZONES:
        sim_to_fraud = rng.randint(1, 7)       # SIM discarded immediately after
    else:
        sim_to_fraud = rng.randint(1, 30)      # Slightly longer for metro operations

### 4.9 VPN / Proxy Flag (New Feature)

    VPN_RATE_BY_METHOD = {
        'NET_BANKING': 0.45,
        'CRYPTO':      0.65,
        'CARD':        0.20,
        'UPI':         0.15,
        'PHONE_CALL':  0.05,
    }
    is_vpn = 1.0 if rng.random() < VPN_RATE_BY_METHOD[method] else 0.0

### 4.10 Round Amount at ATM Law

    ATM_LIMITS = [10000, 20000, 25000, 50000, 100000]
    r = rng.random()
    if r < 0.70:
        withdrawal_amount = rng.choice(ATM_LIMITS)
    else:
        withdrawal_amount = rng.randint(1000, 100000)

---

## 5. Training Pipeline — Step by Step

### Step 1 — Generate the New Dataset

    cd /home/adithya-k-s/PROJECTS/cyber_updated(Aug-15-2026)/cyber
    source venv/bin/activate
    python generate_clean_dataset_v2.py
    # Output: dataset/fraud_data_clean_v2.csv  (150,000 rows x 22 features)
    # Expected time: ~30 seconds

### Step 2 — Validate the Dataset Quality

    python validate_dataset_v2.py
    # Checks all 4 Laws are satisfied:
    # [OK] Law 1: Avg victim-to-cashout distance > 500km
    # [OK] Law 2: 85%+ of mule_account_age_days < 30
    # [OK] Law 3: 95%+ of chain_duration_minutes < 480
    # [OK] Law 4: Amounts within method-specific bounds

### Step 3 — Train the Model

    python train_cashout_model_v2.py
    # Training parameters:
    # - 80% train (120,000 samples) / 20% test (30,000 samples) — temporal split
    # - LightGBM with calibrated probability output
    # - SHAP explainability computed on test set
    # Expected time: 2-4 minutes

### Step 4 — Validate Against Real Complaint Simulation

    python validate_real_world_sim.py
    # Runs 100 hand-crafted real complaint test cases
    # and checks if the model predicts correctly

### Step 5 — Save and Deploy

    # All artifacts saved to ml_models/saved_models/:
    # - lgbm_model_v2.joblib        (main model)
    # - label_encoder_v2.joblib     (zone encoder)
    # - feature_importance_v2.joblib (SHAP values)
    # - model_metrics_v2.json       (accuracy report)

---

## 6. Model Architecture

### Primary Model: LightGBM (Correct Choice — Keep)

Why LightGBM:
- Handles 40-class classification (40 zones) natively
- Fast inference (<5ms per complaint) — critical for real-time alerts
- Built-in SHAP explainability — required for police/judge transparency
- Best in class for tabular/structured complaint record data

Recommended Hyperparameters for v2.0:

    base_lgbm = lgb.LGBMClassifier(
        n_estimators=500,       # Increased from 200
        learning_rate=0.03,     # Slower = better generalization
        max_depth=8,
        num_leaves=63,
        class_weight='balanced',
        colsample_bytree=0.7,
        subsample=0.85,
        subsample_freq=1,
        reg_alpha=0.2,
        reg_lambda=0.2,
        min_child_samples=20,
        random_state=42,
        verbosity=-1,
        n_jobs=-1
    )

### Calibration (Changed from sigmoid to isotonic)

    calibrated_model = CalibratedClassifierCV(
        estimator=base_lgbm,
        method='isotonic',   # Better than sigmoid for 40-class problem
        cv=5
    )

### Secondary Ensemble Layer (Phase 2 — After 100 Real Cases)

    Layer 1: LightGBM on all 22 features → raw zone probabilities
    Layer 2: Zone confidence re-ranking using:
              - Recency bias (recent confirmed cases weighted 2x)
              - NCRB static prior (fallback when model uncertain)
              - IMEI cluster (if IMEI seen before → directly assign to last known zone)

---

## 7. Active Learning Loop

This is the most powerful strategy. Every real complaint confirmed by police becomes a training sample.

### The Loop (Run Monthly)

    Month 0: Train on 150K synthetic samples           -> Expected accuracy: 55-65%
    Month 1: Add  50 confirmed real cases -> Retrain   -> Expected accuracy: 65-72%
    Month 2: Add 100 confirmed real cases              -> Expected accuracy: 70-77%
    Month 3: Add 200 confirmed real cases              -> Expected accuracy: 75-82%
    Month 6: Add 500 confirmed real cases              -> Expected accuracy: 80-87%
    Month 12: 2000+ confirmed real cases               -> Expected accuracy: 85-92%

### How to Capture a Confirmed Case

In apps/predictions/models.py, add this field:

    class CashOutPrediction(models.Model):
        # ... existing fields ...
        confirmed_by_police = models.BooleanField(default=False)
        confirmed_zone_name = models.CharField(max_length=100, null=True, blank=True)
        confirmed_at = models.DateTimeField(null=True, blank=True)
        # When officer confirms prediction was correct:
        # -> this record gets added to training data on next monthly retrain

### Monthly Retrain Script

    python retrain_with_confirmed.py
    # 1. Loads all CashOutPrediction where confirmed_by_police=True
    # 2. Extracts complaint features
    # 3. Adds them to training dataset with 5x weight (real > synthetic)
    # 4. Retrains model
    # 5. Validates
    # 6. Deploys if accuracy improved

---

## 8. Accuracy Milestones & Targets

### On Synthetic Data (After v2.0 Retraining)

| Metric | v1.0 (Current) | v2.0 Target |
|:---|:---|:---|
| Top-1 Accuracy | 52.15% | 55-60% |
| Top-3 Accuracy | 81.17% | 82-86% |
| Top-5 Accuracy | 92.36% | 90-93% |
| Macro F1 Score | 0.451 | 0.55-0.65 |
| Worst Zone F1 (Nashik) | 0.021 | >0.20 |

### On Real Complaints (The Honest Target)

| Phase | Real Cases Available | Expected Top-5 Accuracy |
|:---|:---|:---|
| Phase 0 (Now) | 0 real cases | 40-55% |
| Phase 1 | 50 confirmed cases | 60-68% |
| Phase 2 | 200 confirmed cases | 72-78% |
| Phase 3 | 500 confirmed cases | 78-84% |
| Phase 4 | 2000+ confirmed cases | 85-90% |

Why 100% accuracy is impossible:
- Criminals adapt and change patterns when they discover tracking
- Some cash-outs happen at new locations with no historical signal
- Data the model cannot see (IMEI, cell tower) limits knowability from complaint text alone

---

## 9. What You Need From External APIs

### Tier 1 — Available Now (No Government Permission Needed)

| API / Data Source | Feature It Unlocks | Cost |
|:---|:---|:---|
| ip-api.com / ipinfo.io | is_vpn_or_proxy_ip | Free tier |
| razorpay.com/ifsc | Validate beneficiary_bank_code in real time | Free |
| Google Maps Distance Matrix | distance_from_victim_km in real time | Free tier |
| Indian Holiday Calendar API | festival_proximity with real dates | Free |

### Tier 2 — Needs Police / Government Partnership

| API / Data Source | Feature It Unlocks | Who Has It |
|:---|:---|:---|
| DoT CEIR (Central Equipment Identity Register) | imei_reuse_count | DoT India |
| TRAI / Telecom Operators | sim_activation_to_fraud_days | TRAI |
| I4C (Indian Cybercrime Coordination Centre) | Historical confirmed mule accounts | MHA |
| NPCI Fraud Network | UPI transaction trail in real time | NPCI |

### Tier 3 — Needs RBI / Bank Cooperation

| API / Data Source | Feature It Unlocks | Who Has It |
|:---|:---|:---|
| ATM Transaction Logs | atm_terminal_repeat_count | Banks / NFS |
| Account Opening Date | mule_account_age_days in real time | Banks |
| Cell Tower Logs | Cash-out location confirmation | Telecom operators |

---

## 10. Files to Create / Modify

### Files to CREATE (New)

    cyber/
    ├── generate_clean_dataset_v2.py       <- NEW: Real-world synthetic data generator
    ├── train_cashout_model_v2.py          <- NEW: Training pipeline with 22 features
    ├── validate_dataset_v2.py             <- NEW: Quality checker for 4 Laws
    ├── validate_real_world_sim.py         <- NEW: Simulate real complaints for testing
    ├── retrain_with_confirmed.py          <- NEW: Monthly active learning retrainer
    └── apps/ml_engine/
        ├── fraud_features_v2.py           <- NEW: Feature extractor with 22 features
        └── imei_tracker.py               <- NEW: IMEI cross-complaint lookup logic

### Files to MODIFY (Existing)

    cyber/
    ├── apps/ml_engine/zones.py            <- Add new FEATURE_COLS with 22 features
    ├── apps/ml_engine/cashout_predictor.py <- Load v2 model files
    ├── apps/ml_engine/macro_priors.py     <- Add IMEI and SIM velocity priors
    └── apps/predictions/models.py         <- Add confirmed_by_police field

### Training Sequence (Run in This Exact Order)

    cd /home/adithya-k-s/PROJECTS/cyber_updated(Aug-15-2026)/cyber
    source venv/bin/activate
    python generate_clean_dataset_v2.py
    python validate_dataset_v2.py
    python train_cashout_model_v2.py
    python validate_real_world_sim.py

---

## Summary — Why v2.0 Will Be Dramatically Better

| What Changed | Why It Matters |
|:---|:---|
| Victim location independent of cash-out | Model learns Bangalore victims DO end up in Jamtara — not just nearby zones |
| Mule account age realistic (1-30 days) | Model will correctly flag fresh accounts as high risk |
| Transfer chains complete in <4 hours | Matches real police complaint timelines |
| Amount is method-specific | UPI/Card/NetBanking each have distinct fingerprints |
| 4 new IMEI/device features | Most powerful signal — one phone = one criminal identity |
| 150K samples (up from 55K) | More data = more coverage, especially for smaller zones |
| Active learning loop | Every confirmed real case makes the model permanently smarter |
| Isotonic calibration (up from sigmoid) | Probabilities are more accurate for 40-zone multi-class problem |

---

Source References:
- NCRB Crime in India Reports (2022-2024)
- RBI Annual Payment System Telemetry
- I4C (Indian Cybercrime Coordination Centre) Published Hotspot Reports
- Direct code analysis of CrimeCast v1.0 model failures
- Industry practices from Razorpay, Paytm, and NPCI fraud intelligence teams
