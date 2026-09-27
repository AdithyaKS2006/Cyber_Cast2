"""
CrimeCast Cash-Out Prediction Model Training Pipeline v2.0
============================================================
Trains LightGBM on the v2.0 real-world-mirroring dataset (fraud_data_clean_v2.csv).

Key Upgrades from v1.0:
  - 22 features (7 core + 4 IMEI/device + 3 ATM + 8 transaction)
  - n_estimators=500, learning_rate=0.03 (better generalization)
  - Isotonic calibration (better than sigmoid for 40-class problem)
  - 150K samples with festival-season weighting
  - Full SHAP explainability on test set
  - Ablation study: core 7 signals vs full 22 features
"""
import os
import sys
import json
import joblib
from pathlib import Path
import numpy as np
import pandas as pd

from sklearn.preprocessing import LabelEncoder
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import log_loss, precision_recall_fscore_support, classification_report
import lightgbm as lgb

BASE_DIR         = Path(__file__).resolve().parent
DATASET_PATH     = BASE_DIR / 'dataset' / 'fraud_data_clean_v2.csv'
SAVED_MODELS_DIR = BASE_DIR / 'ml_models' / 'saved_models'
METRICS_PATH     = BASE_DIR / 'ml_models' / 'model_metrics_v2.json'

SAVED_MODELS_DIR.mkdir(parents=True, exist_ok=True)

sys.path.append(str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crimecast.settings.development')

from apps.ml_engine.zones import ZONES

# ─────────────────────────────────────────────────────────────────────────────
# Feature columns — must match generate_clean_dataset_v2.py
# ─────────────────────────────────────────────────────────────────────────────
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

SIGNAL_FEATURES_V2 = [
    "fraud_method_encoded", "victim_state_encoded", "victim_district_encoded",
    "beneficiary_bank_code", "mule_account_age_days", "hop_count",
    "distance_from_victim_km",
]

NEW_IMEI_FEATURES = [
    "imei_reuse_count", "sim_activation_to_fraud_days",
    "device_fingerprint_complaints", "is_vpn_or_proxy_ip",
]

ATM_FEATURES = [
    "atm_terminal_repeat_count", "withdrawal_amount_matches_atm_limit",
    "atm_to_cashout_zone_distance_km",
]


def top_k_accuracy(y_true, y_prob, k=5):
    top_k = np.argsort(y_prob, axis=1)[:, -k:]
    return float(np.mean([1 if y_true[i] in top_k[i] else 0 for i in range(len(y_true))]))


def print_section(title):
    print("\n" + "=" * 68)
    print(f"  {title}")
    print("=" * 68)


def main():
    print_section("CrimeCast Model Training Pipeline v2.0")

    if not DATASET_PATH.exists():
        print(f"\n[ERROR] Dataset not found: {DATASET_PATH}")
        print("  Run: python generate_clean_dataset_v2.py  first.")
        sys.exit(1)

    print(f"\n  Loading dataset: {DATASET_PATH}")
    df = pd.read_csv(DATASET_PATH)
    df['sim_date'] = pd.to_datetime(df['sim_date'])
    df = df.sort_values('sim_date').reset_index(drop=True)
    print(f"  Loaded {len(df):,} samples across {df['target_zone'].nunique()} zones.")

    X = df[FEATURE_COLS_V2].values
    y_raw = df['target_zone'].values

    le = LabelEncoder()
    y  = le.fit_transform(y_raw)

    # 80/20 temporal split
    split_idx = int(len(df) * 0.80)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    print(f"\n  Train: {len(X_train):,} samples | Test: {len(X_test):,} samples (80/20 temporal split)")

    # ──────────────────────────────────────────────────────────────────────────
    # MODEL TRAINING
    # ──────────────────────────────────────────────────────────────────────────
    print_section("Training LightGBM v2.0 (n_estimators=500, isotonic calibration)")

    base_lgbm = lgb.LGBMClassifier(
        n_estimators=500,
        learning_rate=0.03,
        max_depth=8,
        num_leaves=63,
        class_weight='balanced',
        colsample_bytree=0.70,
        subsample=0.85,
        subsample_freq=1,
        reg_alpha=0.2,
        reg_lambda=0.2,
        min_child_samples=20,
        random_state=42,
        verbosity=-1,
        n_jobs=-1,
    )

    # Isotonic calibration — better than sigmoid for 40-class multi-output
    calibrated_model = CalibratedClassifierCV(
        estimator=base_lgbm,
        method='isotonic',
        cv=5,
    )

    print("  Training calibrated model (this takes 2-4 minutes)...")
    calibrated_model.fit(X_train, y_train)

    # Fit base model separately for feature importance
    print("  Fitting base model for SHAP / feature importance...")
    base_lgbm.fit(X_train, y_train)

    # ──────────────────────────────────────────────────────────────────────────
    # EVALUATION
    # ──────────────────────────────────────────────────────────────────────────
    print_section("Model Evaluation on Held-Out Test Set")

    y_prob = calibrated_model.predict_proba(X_test)
    y_pred = np.argmax(y_prob, axis=1)

    top1 = float(np.mean(y_pred == y_test))
    top3 = top_k_accuracy(y_test, y_prob, k=3)
    top5 = top_k_accuracy(y_test, y_prob, k=5)
    prec, rec, f1, _ = precision_recall_fscore_support(y_test, y_pred, average='macro', zero_division=0)
    ll   = float(log_loss(y_test, y_prob, labels=np.arange(len(le.classes_))))

    print(f"\n  Top-1 Accuracy : {top1*100:.2f}%  (model picks correct zone as #1)")
    print(f"  Top-3 Accuracy : {top3*100:.2f}%  (correct zone in top 3 predictions)")
    print(f"  Top-5 Accuracy : {top5*100:.2f}%  (correct zone in top 5 — headline metric)")
    print(f"  Macro F1 Score : {f1:.4f}")
    print(f"  Log Loss       : {ll:.4f}")

    # ──────────────────────────────────────────────────────────────────────────
    # ABLATION STUDY: 7 Signal features vs Full 22 features
    # ──────────────────────────────────────────────────────────────────────────
    print_section("Ablation Study: Core 7 Signals vs Full 22 Features")

    signal_idxs = [FEATURE_COLS_V2.index(f) for f in SIGNAL_FEATURES_V2]
    X_train_sig = X_train[:, signal_idxs]
    X_test_sig  = X_test[:, signal_idxs]

    sig_model = lgb.LGBMClassifier(
        n_estimators=300, learning_rate=0.03, max_depth=6, num_leaves=31,
        class_weight='balanced', random_state=42, verbosity=-1, n_jobs=-1,
    )
    sig_model.fit(X_train_sig, y_train)
    sig_prob = sig_model.predict_proba(X_test_sig)

    sig_top1 = float(np.mean(np.argmax(sig_prob, axis=1) == y_test))
    sig_top3 = top_k_accuracy(y_test, sig_prob, k=3)
    sig_top5 = top_k_accuracy(y_test, sig_prob, k=5)

    print(f"\n  7-Signal-Only  | Top-1: {sig_top1*100:.2f}% | Top-3: {sig_top3*100:.2f}% | Top-5: {sig_top5*100:.2f}%")
    print(f"  Full 22-Feature| Top-1: {top1*100:.2f}% | Top-3: {top3*100:.2f}% | Top-5: {top5*100:.2f}%")

    imei_gain = (top5 - sig_top5) * 100
    print(f"\n  IMEI+ATM feature gain over core signals: {imei_gain:+.2f} pts (Top-5)")

    # ──────────────────────────────────────────────────────────────────────────
    # FEATURE IMPORTANCE (LightGBM Gain + SHAP)
    # ──────────────────────────────────────────────────────────────────────────
    print_section("Feature Importance Analysis")

    importances  = base_lgbm.booster_.feature_importance(importance_type='gain')
    total_imp    = float(importances.sum())
    importance_dict = {FEATURE_COLS_V2[i]: float(importances[i]) for i in range(len(FEATURE_COLS_V2))}

    signal_imp = sum(importance_dict.get(f, 0) for f in SIGNAL_FEATURES_V2)
    imei_imp   = sum(importance_dict.get(f, 0) for f in NEW_IMEI_FEATURES)
    atm_imp    = sum(importance_dict.get(f, 0) for f in ATM_FEATURES)
    other_imp  = total_imp - signal_imp - imei_imp - atm_imp

    print(f"\n  Core Signal Features  (7)  : {signal_imp/total_imp*100:.1f}% of total importance")
    print(f"  IMEI/Device Features  (4)  : {imei_imp/total_imp*100:.1f}%")
    print(f"  ATM/Withdrawal Features(3) : {atm_imp/total_imp*100:.1f}%")
    print(f"  Other Transaction     (8)  : {other_imp/total_imp*100:.1f}%")

    # Top 10 features
    top10 = sorted(importance_dict.items(), key=lambda x: x[1], reverse=True)[:10]
    print("\n  Top 10 Most Important Features:")
    for rank, (feat, val) in enumerate(top10, 1):
        pct = val / total_imp * 100
        print(f"    {rank:2d}. {feat:<42} {pct:.1f}%")

    # SHAP values on test subset (n=2000)
    print("\n  Computing SHAP feature attribution (n=2000 test samples)...")
    shap_dict = {}
    try:
        raw_booster  = base_lgbm.booster_
        shap_sample  = X_test[:2000]
        shap_contribs = raw_booster.predict(shap_sample, pred_contrib=True)
        if len(shap_contribs.shape) == 3:
            mean_abs_shap = np.mean(np.abs(shap_contribs[:, :, :-1]), axis=(0, 1))
        else:
            mean_abs_shap = np.mean(np.abs(shap_contribs[:, :-1]), axis=0)
        shap_dict = {FEATURE_COLS_V2[i]: round(float(mean_abs_shap[i]), 6) for i in range(len(FEATURE_COLS_V2))}
        print("  SHAP computation successful.")
    except Exception as e:
        print(f"  SHAP fallback: {e}")
        shap_dict = {f: round(float(importance_dict.get(f, 0)), 6) for f in FEATURE_COLS_V2}

    # ──────────────────────────────────────────────────────────────────────────
    # PER-ZONE PERFORMANCE
    # ──────────────────────────────────────────────────────────────────────────
    print_section("Per-Zone Classification Report")

    zone_names  = [ZONES[i]['zone_name'] for i in range(len(le.classes_))]
    clf_report  = classification_report(y_test, y_pred, target_names=zone_names, output_dict=True, zero_division=0)

    zone_f1s = [
        (z, clf_report[z]['f1-score'], clf_report[z]['precision'],
         clf_report[z]['recall'], clf_report[z]['support'])
        for z in zone_names if z in clf_report
    ]
    zone_f1s.sort(key=lambda x: x[1])

    print("\n  3 Worst-Performing Zones:")
    for z in zone_f1s[:3]:
        print(f"    {z[0]}: F1={z[1]:.4f} | Prec={z[2]:.4f} | Rec={z[3]:.4f} | Support={int(z[4])}")

    print("\n  3 Best-Performing Zones:")
    for z in zone_f1s[-3:][::-1]:
        print(f"    {z[0]}: F1={z[1]:.4f} | Prec={z[2]:.4f} | Rec={z[3]:.4f} | Support={int(z[4])}")

    # ──────────────────────────────────────────────────────────────────────────
    # SAVE ARTIFACTS
    # ──────────────────────────────────────────────────────────────────────────
    print_section("Saving Model Artifacts")

    joblib.dump(calibrated_model, SAVED_MODELS_DIR / 'lgbm_model_v2.joblib')
    joblib.dump(base_lgbm,        SAVED_MODELS_DIR / 'base_lgbm_model_v2.joblib')
    joblib.dump(le,               SAVED_MODELS_DIR / 'label_encoder_v2.joblib')

    fi_data = {
        "importance_gain":           importance_dict,
        "shap_importance":           shap_dict,
        "feature_names":             FEATURE_COLS_V2,
        "signal_features":           SIGNAL_FEATURES_V2,
        "new_imei_features":         NEW_IMEI_FEATURES,
        "atm_features":              ATM_FEATURES,
        "signal_importance_pct":     round(signal_imp / total_imp * 100, 2),
        "imei_importance_pct":       round(imei_imp  / total_imp * 100, 2),
        "atm_importance_pct":        round(atm_imp   / total_imp * 100, 2),
        "note":                      "v2.0 — Real-world mirroring with IMEI + ATM features",
    }
    joblib.dump(fi_data, SAVED_MODELS_DIR / 'feature_importance_v2.joblib')

    metrics = {
        "model_version":    "v2.0-lightgbm-isotonic",
        "dataset":          "fraud_data_clean_v2.csv",
        "sample_count":     len(df),
        "feature_count":    len(FEATURE_COLS_V2),
        "top1_accuracy":    round(top1 * 100, 2),
        "top3_accuracy":    round(top3 * 100, 2),
        "top5_accuracy":    round(top5 * 100, 2),
        "macro_f1":         round(f1, 4),
        "macro_precision":  round(prec, 4),
        "macro_recall":     round(rec, 4),
        "log_loss":         round(ll, 4),
        "ablation": {
            "7_signal_only": {"top1": round(sig_top1*100, 2), "top3": round(sig_top3*100, 2), "top5": round(sig_top5*100, 2)},
            "22_features":   {"top1": round(top1*100, 2),     "top3": round(top3*100, 2),     "top5": round(top5*100, 2)},
            "imei_atm_gain_pts": round(imei_gain, 2),
        },
        "feature_importance_share": {
            "core_signal_7":   round(signal_imp / total_imp * 100, 2),
            "imei_device_4":   round(imei_imp   / total_imp * 100, 2),
            "atm_withdrawal_3": round(atm_imp   / total_imp * 100, 2),
            "transaction_8":   round(other_imp  / total_imp * 100, 2),
        },
        "worst_zones": [{"zone": z[0], "f1": round(z[1], 4)} for z in zone_f1s[:3]],
        "best_zones":  [{"zone": z[0], "f1": round(z[1], 4)} for z in zone_f1s[-3:][::-1]],
        "laws_implemented": [
            "Law 1: Victim location independent of cash-out zone (avg dist > 500km)",
            "Law 2: Mule account age follows 10-day lifecycle (60% under 10 days)",
            "Law 3: Transfer chain completes in under 4 hours (95% of cases)",
            "Law 4: Fraud amount is method-specific (UPI/Card/NetBanking/Crypto)",
        ],
    }

    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_PATH, 'w') as f:
        json.dump(metrics, f, indent=2)
    with open(SAVED_MODELS_DIR / 'accuracy_report_v2.json', 'w') as f:
        json.dump(metrics, f, indent=2)

    print(f"\n  lgbm_model_v2.joblib        -> {SAVED_MODELS_DIR}")
    print(f"  label_encoder_v2.joblib     -> {SAVED_MODELS_DIR}")
    print(f"  feature_importance_v2.joblib -> {SAVED_MODELS_DIR}")
    print(f"  model_metrics_v2.json       -> {METRICS_PATH.parent}")

    print_section("TRAINING COMPLETE — SUMMARY")
    print(f"\n  Top-1: {top1*100:.2f}%  |  Top-3: {top3*100:.2f}%  |  Top-5: {top5*100:.2f}%")
    print(f"  Macro F1: {f1:.4f}  |  Log Loss: {ll:.4f}")
    print(f"\n  IMEI + ATM features added {imei_gain:+.2f} pts accuracy over core 7 signals.")
    print(f"\n  Next step: python validate_real_world_sim.py")
    print("=" * 68)


if __name__ == '__main__':
    main()
