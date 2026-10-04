import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Sliders, 
  Building2, 
  ShieldAlert, 
  ChevronDown, 
  ChevronUp, 
  Zap,
  Sparkles,
  Play,
  AlertCircle,
  X,
  ExternalLink,
  Clock
} from 'lucide-react';
import apiClient from '../../utils/apiClient';

const DemoControlPanel = () => {
  const [isDemoModeEnabled, setIsDemoModeEnabled] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Form State
  const [amount, setAmount] = useState(200000);
  const [fraudScore, setFraudScore] = useState(0.91);
  const [bank, setBank] = useState('SBIN');

  // Trigger & Timeline State
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [timelineSteps, setTimelineSteps] = useState([]);

  // Check URL parameter & API config on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hasDemoParam = urlParams.get('demo') === 'true' || urlParams.get('demo') === '1';

    if (hasDemoParam) {
      // Fetch backend settings config
      apiClient('/api/v2/system/config/')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.demo_mode) {
            setIsDemoModeEnabled(true);
            setIsVisible(true);
          }
        })
        .catch((err) => {
          console.warn('[DemoControlPanel] Config fetch failed, enabling fallback demo panel:', err);
          // Fallback enable if demo=true is passed explicitly
          setIsDemoModeEnabled(true);
          setIsVisible(true);
        });
    }
  }, []);

  if (!isVisible || !isDemoModeEnabled) {
    return null;
  }

  const handleSimulateFraud = async () => {
    setLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setTimelineSteps([]);

    const payload = {
      amount: Number(amount),
      fraud_score: Number(fraudScore),
      bank: bank
    };

    try {
      // Step 1: Alert Fired (T+0s)
      setTimelineSteps([{ step: 1, label: 'T+0.0s: Alert fired from NPCI Gateway', status: 'active' }]);

      const mockNpciBase = import.meta.env.VITE_MOCK_NPCI_URL || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:8001' : '/mock-npci');
      const response = await fetch(`${mockNpciBase}/fire-fraud-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to dispatch to Mock NPCI server`);
      }

      const resData = await response.json();
      setSuccessMessage('Alert fired — watch the dashboard');

      // Animate timeline steps sequentially
      setTimeout(() => {
        setTimelineSteps((prev) => [
          ...prev.map(s => ({ ...s, status: 'done' })),
          { step: 2, label: 'T+0.3s: CrimeCast received telemetry (WebSocket)', status: 'active' }
        ]);
      }, 300);

      setTimeout(() => {
        setTimelineSteps((prev) => [
          ...prev.map(s => ({ ...s, status: 'done' })),
          { step: 3, label: `T+0.6s: Freeze decision made (${fraudScore >= 0.75 ? 'AUTO_FREEZE' : 'MANUAL_HOLD'})`, status: 'active' }
        ]);
      }, 600);

      setTimeout(() => {
        setTimelineSteps((prev) => [
          ...prev.map(s => ({ ...s, status: 'done' })),
          { step: 4, label: `T+0.9s: I4C API dispatched to Nodal ${bank}`, status: 'active' }
        ]);
      }, 900);

      setTimeout(() => {
        setTimelineSteps((prev) => [
          ...prev.map(s => ({ ...s, status: 'done' })),
          { step: 5, label: 'T+1.2s: Target Account FROZEN ✅', status: 'done' }
        ]);
        setLoading(false);
      }, 1200);

    } catch (err) {
      console.error('Fraud alert simulation failed:', err);
      setErrorMessage(err.message || 'Failed to communicate with Mock NPCI Server');
      setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] rounded-2xl bg-zinc-950/95 border border-red-500/40 backdrop-blur-xl shadow-2xl shadow-red-950/40 text-zinc-100 overflow-hidden font-sans transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-red-950/80 via-zinc-900 to-zinc-950 border-b border-red-500/30">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-wider uppercase flex items-center gap-2 text-zinc-100">
              SIH Judge Control Panel
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">
                LIVE MOCK
              </span>
            </h3>
          </div>
        </div>

        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="p-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title={isMinimized ? "Expand Panel" : "Minimize Panel"}
        >
          {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Body */}
      {!isMinimized && (
        <div className="p-4 space-y-4 text-xs">
          {/* Controls Group */}
          <div className="space-y-3 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/80">
            {/* Amount Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <span>💰 Amount:</span>
                  <span className="font-mono text-amber-400 font-bold">{formatCurrency(amount)}</span>
                </label>
              </div>
              <input
                type="range"
                min="50000"
                max="500000"
                step="10000"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-0.5">
                <span>₹50,000</span>
                <span>₹500,000</span>
              </div>
            </div>

            {/* Fraud Score Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <span>⚠️ Fraud Score:</span>
                  <span className="font-mono text-red-400 font-bold">{Number(fraudScore).toFixed(2)}</span>
                </label>
              </div>
              <input
                type="range"
                min="0.70"
                max="0.99"
                step="0.01"
                value={fraudScore}
                onChange={(e) => setFraudScore(Number(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-0.5">
                <span>0.70 (Med)</span>
                <span>0.99 (Critical)</span>
              </div>
            </div>

            {/* Bank Select */}
            <div>
              <label className="font-semibold text-zinc-300 block mb-1">
                🏦 Target Bank:
              </label>
              <select
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 font-mono text-xs focus:outline-none focus:border-red-500"
              >
                <option value="SBIN">State Bank of India (SBIN)</option>
                <option value="HDFC">HDFC Bank (HDFC)</option>
                <option value="ICIC">ICICI Bank (ICIC)</option>
                <option value="UTIB">Axis Bank (UTIB)</option>
              </select>
            </div>
          </div>

          {/* Action Trigger Button */}
          <button
            onClick={handleSimulateFraud}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg shadow-red-950/60 active:scale-95 transition-all flex items-center justify-center gap-2 border border-red-400/30 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Simulating NPCI Fraud Alert...</span>
              </>
            ) : (
              <>
                <span className="text-base leading-none">🔴</span>
                <span>SIMULATE LIVE FRAUD</span>
              </>
            )}
          </button>

          {/* Status Banners */}
          {successMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Live Telemetry Timeline */}
          {timelineSteps.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Interdiction Pipeline Telemetry</span>
                <Sparkles className="w-3 h-3 text-amber-400" />
              </div>
              <div className="space-y-1 font-mono text-[11px]">
                {timelineSteps.map((s) => (
                  <div
                    key={s.step}
                    className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${
                      s.status === 'active'
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse'
                        : 'text-emerald-400 bg-emerald-500/10'
                    }`}
                  >
                    {s.status === 'active' ? (
                      <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    )}
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DemoControlPanel;
