#!/usr/bin/env python3
"""
CrimeCast — Manual Prediction Test Utility
==========================================
Allows analysts and developers to manually test any location/zone,
ISP telemetry, victim state, fraud amount, and fraud method to verify
whether the ML model and Layer 2 spatial engine detect and rank it correctly.

Usage Examples:
  # Test Mysore with default simulated ISP telemetry:
  python test_manual_prediction.py --zone mysore --amount 45000

  # Test Jamtara with UPI fraud:
  python test_manual_prediction.py --zone jamtara --amount 25000 --method UPI

  # Test Nuh with custom narrative:
  python test_manual_prediction.py --zone nuh --narrative "Suspect operated from Nuh Mewat mobile grid"

  # Interactive prompt mode:
  python test_manual_prediction.py --interactive
"""

import os
import sys
import argparse
import random
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crimecast.settings')
django.setup()

from django.utils import timezone
from apps.complaints.models import Complaint
from apps.predictions.tasks import run_prediction_pipeline
from apps.predictions.models import CashOutPrediction
from apps.predictions.serializers import PredictionDetailSerializer
from apps.ml_engine.zones import ZONE_BY_ID, ZONES


def run_manual_test(zone_target='mysore', amount=45000.0, method='UPI', victim_city='New Delhi', narrative_custom=None):
    clean_zone = zone_target.strip().title()
    
    # Generate unique complaint number
    rand_suffix = random.randint(1000, 9999)
    complaint_no = f"CC-TEST-{clean_zone[:3].upper()}-{rand_suffix}"

    default_narrative = (
        f"Victim was targeted in an online investment/task scam from {victim_city}. "
        f"Stolen funds were routed across multiple mule accounts into Karnataka/telecom zone. "
        f"Live ISP data gateway and cell tower CDR telemetry triangulated active suspect sessions "
        f"operating near {clean_zone} central commercial corridor."
    )
    narrative = narrative_custom or default_narrative

    print("\n" + "=" * 70)
    print(f"  CRIMECAST MANUAL PREDICTION TEST: {clean_zone.upper()}")
    print("=" * 70)
    print(f"  • Complaint Number : {complaint_no}")
    print(f"  • Target Zone      : {clean_zone}")
    print(f"  • Fraud Amount     : ₹{amount:,.2f}")
    print(f"  • Payment Method   : {method}")
    print(f"  • Victim Location  : {victim_city}")
    print(f"  • Narrative        : {narrative[:90]}...")
    print("-" * 70)
    print("  Running ML inference engine + Layer 2 spatial triangulation...\n")

    # Ingest test complaint into database
    complaint = Complaint.objects.create(
        complaint_number=complaint_no,
        victim_name="Manual Test Officer",
        victim_phone="9811002233",
        victim_district=victim_city,
        victim_state="Delhi" if victim_city == "New Delhi" else "Karnataka",
        victim_pincode="110001",
        fraud_amount=amount,
        fraud_method=method,
        fraud_timestamp=timezone.now(),
        suspect_account_number=f"62109{rand_suffix}891",
        suspect_bank="SBI",
        suspect_phone="9845012891",
        narrative_text=narrative,
        status='NEW'
    )

    # Execute end-to-end prediction pipeline
    preds = run_prediction_pipeline(complaint)
    
    if not preds:
        print("  ❌ [ERROR] Prediction pipeline returned no results.")
        return

    top_pred = preds[0]
    serializer = PredictionDetailSerializer(top_pred)
    data = serializer.data

    detected_zone = data.get('predicted_zone_name')
    prob_pct = round(float(data.get('probability', 0)) * 100, 1)
    eta = data.get('eta_hours')

    print(f"  🎯 PREDICTION RESULT: {detected_zone.upper()} (Rank #1)")
    print(f"     • Calibrated Confidence : {prob_pct}%")
    print(f"     • Interdiction Window   : {eta} hours (Velocity ETA)")
    print(f"     • Status                : {top_pred.outcome}")

    # ISP & Cell Tower Telemetry
    isp = data.get('isp_telecom_location')
    if isp:
        print("\n  📡 ISP & TELECOM CELL FOOTPRINT:")
        print(f"     • Carrier / ISP   : {isp.get('isp_provider')}")
        print(f"     • Telecom Circle  : {isp.get('telecom_circle')}")
        print(f"     • Cell Tower ID   : {isp.get('cell_tower_id')}")
        print(f"     • Sector Azimuth  : {isp.get('cell_sector_azimuth')}")
        print(f"     • Tower Lat/Lon   : {isp.get('cell_tower_lat')}, {isp.get('cell_tower_lon')}")
        print(f"     • Gateway IP      : {isp.get('gateway_ip')}")
        print(f"     • Suspect IMEI    : {isp.get('tracked_imei')}")
        print(f"     • Burner Risk     : {isp.get('device_burn_risk')}")

    # Micro-GIS Candidate ATMs
    atms = data.get('candidate_atms') or []
    if atms:
        print(f"\n  🏧 MICRO-GIS TARGET ATMS ({len(atms)} Terminals Pinpointed):")
        primary = atms[0]
        print(f"     ★ PRIMARY TARGET : {primary.get('bank')} ({primary.get('atm_id')})")
        print(f"       Address        : {primary.get('address')}")
        print(f"       Coordinates    : {primary.get('lat')}, {primary.get('lon')}")
        if isp:
            print(f"       Proximity      : ~{isp.get('tower_to_atm_distance_km')} km from cell tower")
        
        if len(atms) > 1:
            print("     Other Candidate ATMs in Corridor:")
            for alt in atms[1:]:
                print(f"       - {alt.get('bank')}: {alt.get('address')}")

    # Proof Methods
    explanation = data.get('method_explanation') or {}
    proofs = explanation.get('proof_methods') or []
    if proofs:
        print(f"\n  🛡️  PROOF METHODS ({len(proofs)} Corroborating Signals):")
        for p in proofs:
            print(f"     [{p.get('status')}] {p.get('title')} ({p.get('weight')})")

    # Web URL
    print("\n" + "=" * 70)
    print(f"  👉 VIEW IN BROWSER UI:")
    print(f"     http://localhost:3000/app/predictions/{top_pred.id}")
    print("=" * 70 + "\n")


def main():
    parser = argparse.ArgumentParser(description="CrimeCast Manual Prediction Tester")
    parser.add_argument('--zone', type=str, default='mysore', help='Target cash-out zone (e.g. mysore, jamtara, nuh, deoghar)')
    parser.add_argument('--amount', type=float, default=45000.0, help='Fraud amount in INR')
    parser.add_argument('--method', type=str, default='UPI', choices=['UPI', 'CARD', 'NET_BANKING', 'PHONE_CALL', 'OTHER'], help='Fraud payment method')
    parser.add_argument('--victim', type=str, default='New Delhi', help='Victim city/district')
    parser.add_argument('--narrative', type=str, default=None, help='Custom narrative text')
    parser.add_argument('--interactive', action='store_true', help='Prompt for inputs interactively')

    args = parser.parse_args()

    if args.interactive:
        print("\n=== CrimeCast Interactive Prediction Tester ===")
        zone = input("Enter target zone [default: Mysore]: ").strip() or "mysore"
        amt_str = input("Enter fraud amount in INR [default: 45000]: ").strip() or "45000"
        method = input("Enter fraud method (UPI/CARD/NET_BANKING) [default: UPI]: ").strip().upper() or "UPI"
        victim = input("Enter victim district [default: New Delhi]: ").strip() or "New Delhi"
        narrative = input("Enter custom narrative (or press Enter to auto-generate): ").strip() or None
        run_manual_test(zone_target=zone, amount=float(amt_str), method=method, victim_city=victim, narrative_custom=narrative)
    else:
        run_manual_test(
            zone_target=args.zone,
            amount=args.amount,
            method=args.method,
            victim_city=args.victim,
            narrative_custom=args.narrative
        )


if __name__ == '__main__':
    main()
