"""
CrimeCast Active Learning Retrainer (retrain_with_confirmed.py)
=============================================================
Incorporates police-confirmed ground-truth cash-out predictions back into
the training corpus with a 5x sample weight multiplier to iteratively boost
field accuracy on real cases.

Implements MODEL_PRD.md Section 7:
  - Loads CashOutPrediction records where confirmed_by_police=True
  - Generates 22 features via FraudFeatureExtractorV2
  - Combines with synthetic baseline data
  - Calibrates and validates model
  - Deploys updated weights to ml_models/saved_models/
"""
import os
import sys
import json
from pathlib import Path
import numpy as np
import pandas as pd
import joblib

BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crimecast.settings.development')

import django
django.setup()

from apps.predictions.models import CashOutPrediction
from apps.ml_engine.zones import ZONES, ZONE_BY_ID
from apps.ml_engine.fraud_features_v2 import FraudFeatureExtractorV2, FEATURE_COLS_V2
from sklearn.preprocessing import LabelEncoder
from sklearn.calibration import CalibratedClassifierCV
import lightgbm as lgb

DATASET_PATH     = BASE_DIR / 'dataset' / 'fraud_data_clean_v2.csv'
SAVED_MODELS_DIR = BASE_DIR / 'ml_models' / 'saved_models'
METRICS_PATH     = BASE_DIR / 'ml_models' / 'model_metrics_v2.json'


def main():
    print("=" * 70)
    print("  CrimeCast Active Learning Pipeline — Retraining with Police Confirmations")
    print("=" * 70)

    confirmed_qs = CashOutPrediction.objects.filter(confirmed_by_police=True).select_related('complaint')
    confirmed_count = confirmed_qs.count()
    print(f"\n  Found {confirmed_count} police-confirmed ground truth cases in database.")

    if not DATASET_PATH.exists():
        print(f"[ERROR] Baseline dataset not found at {DATASET_PATH}")
        sys.exit(1)

    print(f"  Loading synthetic baseline dataset: {DATASET_PATH}...")
    df_base = pd.read_csv(DATASET_PATH)
    print(f"  Loaded {len(df_base):,} synthetic baseline samples.")

    extractor = FraudFeatureExtractorV2()
    confirmed_rows = []

    # Map zone name to zone index
    zone_name_to_idx = {z['zone_name'].lower(): i for i, z in enumerate(ZONES)}

    for pred in confirmed_qs:
        complaint = pred.complaint
        hops = list(complaint.transaction_hops.all().order_by('hop_number'))
        features = extractor.extract(complaint, hops)

        zone_name = (pred.confirmed_zone_name or pred.predicted_zone_name).lower().strip()
        zone_idx = zone_name_to_idx.get(zone_name)
        if zone_idx is None:
            continue

        row_dict = {col: features[i] for i, col in enumerate(FEATURE_COLS_V2)}
        row_dict['target_zone'] = zone_idx
        row_dict['is_real']     = 1
        
        # Apply 5x weighting for confirmed real cases
        for _ in range(5):
            confirmed_rows.append(dict(row_dict))

    if confirmed_rows:
        df_real = pd.DataFrame(confirmed_rows)
        df_base['is_real'] = 0
        df_combined = pd.concat([df_base, df_real], ignore_index=True)
        print(f"  Added {len(confirmed_rows)} weighted real-world records.")
    else:
        print("  No police confirmations available yet. Training with baseline synthetic data.")
        df_combined = df_base

    X = df_combined[FEATURE_COLS_V2].values
    y_raw = df_combined['target_zone'].values

    le = LabelEncoder()
    y = le.fit_transform(y_raw)

    split_idx = int(len(df_combined) * 0.80)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    print(f"\n  Training LightGBM model (samples: {len(X_train):,} train, {len(X_test):,} test)...")
    base_lgbm = lgb.LGBMClassifier(
        n_estimators=300,
        learning_rate=0.04,
        max_depth=7,
        num_leaves=45,
        class_weight='balanced',
        random_state=42,
        verbosity=-1,
        n_jobs=-1,
    )

    calibrated_model = CalibratedClassifierCV(
        estimator=base_lgbm,
        method='isotonic',
        cv=3,
    )
    calibrated_model.fit(X_train, y_train)

    # Evaluate
    probs = calibrated_model.predict_proba(X_test)
    preds = np.argmax(probs, axis=1)
    top1 = float(np.mean(preds == y_test)) * 100.0
    top5 = float(np.mean([1 if y_test[i] in np.argsort(probs[i])[-5:] else 0 for i in range(len(y_test))])) * 100.0

    print(f"\n  Validation Results: Top-1 = {top1:.2f}% | Top-5 = {top5:.2f}%")

    # Save artifacts
    print(f"\n  Saving updated model artifacts to {SAVED_MODELS_DIR}...")
    joblib.dump(calibrated_model, SAVED_MODELS_DIR / 'lgbm_model_v2.joblib')
    joblib.dump(le, SAVED_MODELS_DIR / 'label_encoder_v2.joblib')

    print("  [SUCCESS] Active learning retraining complete. Model v2.0 updated.")
    print("=" * 70)


if __name__ == '__main__':
    main()
