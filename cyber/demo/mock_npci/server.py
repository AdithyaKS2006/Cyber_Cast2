import os
import hmac
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import httpx

app = FastAPI(
    title="Mock NPCI Fraud Ingestion Gateway",
    description="Simulates NPCI real-time fraud alert telemetry webhooks with HMAC signing."
)

APP_BASE_URL = (os.getenv("CRIMECAST_APP_URL") or os.getenv("CRIMECAST_INGEST_URL_BASE") or "http://localhost:8000").rstrip("/")
CRIMECAST_INGEST_URL = f"{APP_BASE_URL}/api/v2/ingest/npci-alert/"
SHARED_SECRET = os.getenv("SHARED_SECRET", "dev-secret-change-in-prod")


class FraudAlertRequest(BaseModel):
    amount: Optional[float] = Field(default=200000.0, description="Transaction amount in INR")
    fraud_score: Optional[float] = Field(default=0.91, description="Calculated fraud probability score (0.0 to 1.0)")
    bank: Optional[str] = Field(default="HDFC", description="Bank code associated with the debit account")
    from_account: Optional[str] = Field(default="XXXX1234", description="Victim account number")
    from_bank_ifsc: Optional[str] = Field(default="HDFC0001234", description="Source bank IFSC code")
    to_account: Optional[str] = Field(default="XXXX5678", description="Mule target account number")
    to_bank_ifsc: Optional[str] = Field(default="SBIN0005678", description="Target bank IFSC code")
    fraud_indicators: Optional[List[str]] = Field(
        default=["velocity_breach", "new_beneficiary", "odd_hour"],
        description="Flags indicating anomalous behavior"
    )


@app.get("/health")
def health_check():
    return {"status": "mock_npci_running"}


@app.post("/fire-fraud-alert")
async def fire_fraud_alert(payload_override: Optional[FraudAlertRequest] = None):
    """
    Constructs an NPCI-compliant fraud alert, signs it with HMAC-SHA256,
    and posts it to the CrimeCast backend.
    """
    if payload_override is None:
        payload_override = FraudAlertRequest()

    alert_id = f"NPCI-{uuid.uuid4().hex[:8].upper()}"
    timestamp_iso = datetime.now(timezone.utc).isoformat()

    target_ifsc = f"{payload_override.bank.upper()}0005678" if payload_override.bank else payload_override.to_bank_ifsc

    alert_payload = {
        "alert_id": alert_id,
        "alert_type": "SUSPICIOUS_DEBIT",
        "from_account": payload_override.from_account,
        "from_bank_ifsc": payload_override.from_bank_ifsc,
        "to_account": payload_override.to_account,
        "to_bank_ifsc": target_ifsc,
        "amount": payload_override.amount,
        "fraud_score": payload_override.fraud_score,
        "fraud_indicators": payload_override.fraud_indicators,
        "timestamp": timestamp_iso
    }

    # Serialize to JSON bytes
    payload_bytes = json.dumps(alert_payload, separators=(',', ':')).encode('utf-8')

    # Compute HMAC-SHA256 signature
    signature = hmac.new(
        SHARED_SECRET.encode('utf-8'),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()

    headers = {
        "Content-Type": "application/json",
        "X-CrimeCast-Signature": signature
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                CRIMECAST_INGEST_URL,
                content=payload_bytes,
                headers=headers
            )

        return {
            "status": "success",
            "target_url": CRIMECAST_INGEST_URL,
            "signature_sent": signature,
            "backend_status_code": response.status_code,
            "backend_response": response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text,
            "sent_payload": alert_payload
        }
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to connect to CrimeCast backend at {CRIMECAST_INGEST_URL}: {str(exc)}"
        )
