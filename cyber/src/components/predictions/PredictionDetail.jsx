/**
 * PredictionDetail.jsx — CrimeCast
 * Shows full prediction record including Gemini investigation brief,
 * SHAP feature importance chart, zone map, outcome actions,
 * and the new Intelligence Dispatch & Analyst Review Queue.
 */
import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Zap, MapPin, Clock, CheckCircle,
  AlertTriangle, Loader2, Shield, TrendingUp, X, Send, UserCheck, Activity, Copy, Check
} from 'lucide-react';
import apiClient from '../../utils/apiClient';
import useTheme from '../../hooks/useTheme';

/* ── Helpers ─────────────────────────────────────────────────────────── */
const probColor = (p) =>
  p >= 0.15 ? '#ef4444' : p >= 0.12 ? '#f97316' : '#eab308';

const OutcomeBadge = ({ outcome }) => {
  const map = {
    PENDING:     'bg-orange-900/30 text-orange-400 border-orange-500/30',
    INTERCEPTED: 'bg-green-900/30  text-green-400  border-green-500/30',
    MISSED:      'bg-red-900/30    text-red-400    border-red-500/30',
    FALSE_ALARM: 'bg-zinc-800/40   text-zinc-500   border-zinc-600/30',
    NEEDS_REVIEW:'bg-yellow-900/30 text-yellow-400 border-yellow-500/30',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-[9px] font-black border uppercase ${map[outcome] || map.PENDING}`}>
      {outcome?.replace('_', ' ')}
    </span>
  );
};

/* ── SHAP horizontal bar chart ───────────────────────────────────────── */
const ShapChart = ({ shap }) => {
  if (!shap || !Object.keys(shap).length) {
    return (
      <div className="text-[10px] text-zinc-500 font-bold uppercase italic py-4">
        Feature importance data unavailable for this prediction.
      </div>
    );
  }
  const entries = Object.entries(shap)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 8);
  const maxVal = Math.max(...entries.map(([, v]) => Math.abs(v)));

  return (
    <div className="space-y-2">
      {entries.map(([feat, val]) => {
        const pct = (Math.abs(val) / maxVal) * 100;
        const color = val >= 0 ? '#f97316' : '#3b82f6';
        return (
          <div key={feat} className="flex items-center gap-3">
            <span className="text-[9px] font-bold text-zinc-500 uppercase w-36 flex-shrink-0 truncate">
              {feat.replace(/_/g, ' ')}
            </span>
            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                   style={{ width: `${pct.toFixed(1)}%`, background: color }} />
            </div>
            <span className="text-[9px] font-black w-12 text-right"
                  style={{ color }}>
              {val >= 0 ? '+' : ''}{val.toFixed(3)}
            </span>
          </div>
        );
      })}
      <div className="flex gap-4 pt-1">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
          <span className="text-[8px] text-zinc-600 font-bold uppercase">Increases risk</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
          <span className="text-[8px] text-zinc-600 font-bold uppercase">Decreases risk</span>
        </div>
      </div>
    </div>
  );
};

/* ── Gemini brief renderer (markdown-lite) ───────────────────────────── */
const BriefRenderer = ({ text }) => {
  if (!text) return (
    <p className="text-[10px] text-zinc-600 font-bold uppercase italic">
      Brief not yet generated.
    </p>
  );
  const cleanText = text.replace(/\uFFFD/g, '');
  const parts = cleanText.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className="space-y-3 text-[11px] leading-relaxed text-zinc-300">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <p key={i} className="text-[10px] font-black text-orange-400 uppercase tracking-widest mt-4 first:mt-0">
              {part.replace(/\*\*/g, '')}
            </p>
          );
        }
        return part.split('\n').map((line, j) => {
          if (!line.trim()) return null;
          if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
            return (
              <div key={`${i}-${j}`} className="flex gap-2">
                <span className="text-orange-500 flex-shrink-0">•</span>
                <span>{line.replace(/^[•\-]\s*/, '')}</span>
              </div>
            );
          }
          return <p key={`${i}-${j}`}>{line}</p>;
        });
      })}
    </div>
  );
};

/* ── Outcome action modal ────────────────────────────────────────────── */
const OutcomeModal = ({ current, onClose, onConfirm }) => {
  const options = [
    { value: 'INTERCEPTED', label: 'Intercepted ✓', color: '#22c55e' },
    { value: 'MISSED',      label: 'Missed',        color: '#ef4444' },
    { value: 'FALSE_ALARM', label: 'False Alarm',   color: '#71717a' },
  ].filter(o => o.value !== current);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-80 rounded-2xl border border-orange-500/30 p-6 space-y-4"
           style={{ background: 'rgba(0,0,0,0.97)' }}>
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-black text-white uppercase">Update Outcome</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-zinc-500 hover:text-white" /></button>
        </div>
        <div className="space-y-2">
          {options.map(o => (
            <button key={o.value} onClick={() => onConfirm(o.value)}
              className="w-full py-3 rounded-xl text-[10px] font-black uppercase transition-all hover:opacity-90"
              style={{ background: `${o.color}20`, border: `1px solid ${o.color}40`, color: o.color }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ── Analyst Review Banner ───────────────────────────────────────────── */
const AnalystReviewBanner = ({ onApprove, onReject, processing }) => (
  <div className="rounded-2xl border border-yellow-500/40 p-5 flex flex-col md:flex-row items-center justify-between gap-4"
       style={{ background: 'linear-gradient(90deg, rgba(234,179,8,0.1), rgba(0,0,0,0))' }}>
    <div className="flex items-center gap-4">
      <div className="p-3 bg-yellow-500/20 rounded-full border border-yellow-500/30">
        <UserCheck className="w-6 h-6 text-yellow-400" />
      </div>
      <div>
        <h2 className="text-sm font-black text-yellow-400 uppercase tracking-widest">Analyst Review Queue</h2>
        <p className="text-[10px] text-zinc-400 mt-1">This prediction's confidence is below the auto-dispatch threshold. Manual review required.</p>
      </div>
    </div>
    <div className="flex gap-3 w-full md:w-auto">
      <button 
        onClick={onReject} 
        disabled={processing}
        className="flex-1 md:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors">
        Reject (False Alarm)
      </button>
      <button 
        onClick={onApprove} 
        disabled={processing}
        className="flex-1 md:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase bg-yellow-600 text-black hover:bg-yellow-500 disabled:opacity-50 transition-colors shadow-[0_0_15px_rgba(234,179,8,0.3)]">
        {processing ? 'Processing...' : 'Approve & Dispatch'}
      </button>
    </div>
  </div>
);

/* ── Intelligence Dispatch Panel ─────────────────────────────────────── */
const IntelligenceDispatch = ({ prediction, onDispatch, dispatching }) => {
  const isNeedsReview = prediction.outcome === 'NEEDS_REVIEW';
  const pkg = prediction.intelligence_package;
  const [copiedId, setCopiedId] = useState(null);
  const [bankTab, setBankTab] = useState({});

  const handleCopy = (data, id) => {
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };


  if (pkg) {
    // Render the active package
    return (
      <div className="rounded-2xl border border-emerald-500/30 p-6 space-y-6 relative overflow-hidden"
           style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}>
        
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg border border-emerald-500/30">
              <Send className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-[12px] font-black text-white uppercase tracking-widest">Intelligence Package</h2>
              <p className="text-[10px] text-zinc-400">ID: {String(pkg.id || '').split('-')[0].toUpperCase()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full text-[9px] font-black uppercase tracking-wider">
              ⚡ [SIMULATED DELIVERY]
            </span>
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-full text-[9px] font-black uppercase shadow-[0_0_10px_rgba(16,185,129,0.2)]">
              Active · {pkg.status}
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3 hover:border-orange-500/30 transition-colors">
            <h3 className="text-[10px] text-zinc-500 font-bold uppercase border-b border-zinc-800 pb-2">Bank Alerts ({pkg.bank_alerts?.length || 0})</h3>
            <div className="space-y-2">
              {pkg.bank_alerts?.map(a => (
                <div key={a.id} className="flex justify-between items-center text-xs text-white">
                  <span className="truncate pr-2">{a.target_institution}</span>
                  <span className="text-orange-400 font-bold text-[9px] bg-orange-500/10 px-2 py-0.5 rounded">{a.status}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3 hover:border-blue-500/30 transition-colors">
            <h3 className="text-[10px] text-zinc-500 font-bold uppercase border-b border-zinc-800 pb-2">ATM Alerts ({pkg.atm_alerts?.length || 0})</h3>
            <div className="space-y-2">
              {pkg.atm_alerts?.map(a => (
                <div key={a.id} className="flex justify-between items-center text-xs text-white">
                  <span className="truncate pr-2">{a.target_network}</span>
                  <span className="text-blue-400 font-bold text-[9px] bg-blue-500/10 px-2 py-0.5 rounded">{a.status}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3 hover:border-emerald-500/30 transition-colors">
            <h3 className="text-[10px] text-zinc-500 font-bold uppercase border-b border-zinc-800 pb-2">LEA Dispatches ({pkg.lea_dispatches?.length || 0})</h3>
            <div className="space-y-2">
              {pkg.lea_dispatches?.map(a => (
                <div key={a.id} className="flex justify-between items-center text-xs text-white">
                  <span className="truncate pr-2">{a.target_officer_id || a.target_district || 'Nodal Officer'}</span>
                  <span className="text-emerald-400 font-bold text-[9px] bg-emerald-500/10 px-2 py-0.5 rounded">{a.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-800 relative z-10">
          <h3 className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-3">Integration Payloads (I4C/NCRP Compliant)</h3>
          <div className="max-h-56 overflow-y-auto bg-black/60 p-3 rounded-xl border border-zinc-800 font-mono text-[9px] text-emerald-500/80 space-y-4">
            {pkg.bank_alerts?.map(a => a.payload && (
              <div key={a.id} className="relative group border border-zinc-800/60 rounded-xl p-2.5 bg-black/40">
                <div className="flex flex-wrap justify-between items-center gap-2 mb-2 pb-1 border-b border-zinc-800/60">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-400/90 font-bold"># BANK_{a.target_institution.toUpperCase()}_PAYLOAD</span>
                    {a.payload.iso20022_xml && (
                      <div className="flex items-center bg-zinc-900 rounded-lg p-0.5 border border-zinc-800 text-[8px]">
                        <button
                          type="button"
                          onClick={() => setBankTab(prev => ({ ...prev, [a.id]: 'json' }))}
                          className={`px-2 py-0.5 rounded font-bold transition-colors ${
                            (bankTab[a.id] || 'json') === 'json'
                              ? 'bg-orange-500 text-black'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          I4C JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => setBankTab(prev => ({ ...prev, [a.id]: 'xml' }))}
                          className={`px-2 py-0.5 rounded font-bold flex items-center gap-1 transition-colors ${
                            bankTab[a.id] === 'xml'
                              ? 'bg-emerald-500 text-black'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          ISO 20022 camt.056 (XML)
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleCopy(bankTab[a.id] === 'xml' ? a.payload.iso20022_xml : a.payload, a.id)}
                    className="flex items-center gap-1 text-[8px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800/80"
                  >
                    {copiedId === a.id ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy {bankTab[a.id] === 'xml' ? 'XML' : 'JSON'}</>}
                  </button>
                </div>
                <pre className="overflow-x-auto text-[9px] leading-tight">
                  {bankTab[a.id] === 'xml'
                    ? a.payload.iso20022_xml
                    : JSON.stringify(a.payload, null, 2)}
                </pre>
              </div>
            ))}

            {pkg.atm_alerts?.map(a => a.payload && (
              <div key={a.id} className="relative group">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-blue-400/80 font-bold"># ATM_{a.target_network.toUpperCase()}_PAYLOAD</span>
                  <button onClick={() => handleCopy(a.payload, a.id)} className="flex items-center gap-1 text-[8px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800/80">
                    {copiedId === a.id ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy JSON</>}
                  </button>
                </div>
                <pre>{JSON.stringify(a.payload, null, 2)}</pre>
              </div>
            ))}
            {pkg.lea_dispatches?.map(a => a.payload && (
              <div key={a.id} className="relative group">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-emerald-400/80 font-bold"># LEA_{(a.target_officer_id || a.target_district || 'OFFICER').toUpperCase()}_PAYLOAD</span>
                  <button onClick={() => handleCopy(a.payload, a.id)} className="flex items-center gap-1 text-[8px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800/80">
                    {copiedId === a.id ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy JSON</>}
                  </button>
                </div>
                <pre>{JSON.stringify(a.payload, null, 2)}</pre>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-6 border-t border-zinc-800 relative z-10">
          <h3 className="text-[10px] text-zinc-500 font-black uppercase mb-4 tracking-widest flex items-center gap-2">
            <Activity className="w-3 h-3" /> Audit Timeline
          </h3>
          <div className="space-y-0 pl-1">
            {pkg.audit_logs?.map((log, i) => (
              <div key={log.id} className="flex gap-4 relative pb-5">
                {/* Vertical line connecting nodes */}
                {i < pkg.audit_logs.length - 1 && (
                  <div className="absolute left-[3px] top-2 bottom-[-10px] w-px bg-zinc-800" />
                )}
                {/* Node */}
                <div className="relative z-10 mt-1">
                  <div className="w-[7px] h-[7px] rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                </div>
                {/* Content */}
                <div className="-mt-1">
                  <p className="text-[9px] font-mono text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()} · {new Date(log.timestamp).toLocaleDateString()}</p>
                  <p className="text-[11px] font-black text-white uppercase mt-0.5 tracking-tight">{log.action.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-zinc-400 mt-1">{typeof log.details === 'object' && log.details !== null ? JSON.stringify(log.details) : String(log.details ?? '')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Before Dispatch
  return (
    <div className="rounded-2xl border border-zinc-800 p-6 space-y-6"
         style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center gap-2">
        <Send className="w-5 h-5 text-orange-400" />
        <h2 className="text-[12px] font-black text-white uppercase tracking-widest">Intelligence Dispatch</h2>
      </div>
      <p className="text-xs text-zinc-400">
        Ready to broadcast threat intelligence package to transaction banks, ATM networks, and local nodal officers.
      </p>
      
      <button 
        onClick={() => onDispatch(false)} 
        disabled={isNeedsReview || dispatching}
        className={`w-full py-4 rounded-xl text-[12px] font-black uppercase transition-all flex items-center justify-center gap-2 ${
          isNeedsReview 
            ? 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed' 
            : 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:opacity-90 shadow-[0_0_20px_rgba(249,115,22,0.3)]'
        }`}
      >
        {dispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {isNeedsReview ? 'Analyst Review Required' : 'Dispatch Intelligence Package'}
      </button>
    </div>
  );
};


/* ══ Main Component ════════════════════════════════════════════════════ */
const PredictionDetail = ({ predictionId, navigate }) => {
  const isLight = useTheme();
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [showOutcome, setShowOutcome] = useState(false);
  const [updating, setUpdating]     = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);

  const handleRegenerateBrief = async () => {
    setBriefLoading(true);
    try {
      const res = await apiClient(`/api/v1/predictions/${predictionId}/brief/`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setPrediction(prev => ({ ...prev, gemini_brief: data.gemini_brief }));
    } catch (e) {
      setError('Brief generation failed: ' + (e.message || 'Unknown error'));
    } finally {
      setBriefLoading(false);
    }
  };

  const load = async () => {
    if (!predictionId || predictionId.startsWith(':') || predictionId === 'undefined' || predictionId === 'null') {
      setError('Invalid Prediction ID format.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient(`/api/v1/predictions/${predictionId}/`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.error || `Prediction not found (${res.status})`);
      }
      const data = await res.json();
      setPrediction(data);
    } catch (e) {
      const msg = typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e);
      setError(msg || 'Failed to load prediction');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [predictionId]);

  const handleOutcomeUpdate = async (outcome) => {
    setUpdating(true);
    setShowOutcome(false);
    try {
      const res = await apiClient(`/api/v1/predictions/${predictionId}/outcome/`, {
        method: 'PATCH',
        body: JSON.stringify({ outcome }),
      });
      if (!res.ok) throw new Error(`Failed to update outcome (${res.status})`);
      // Reload to get updated state
      await load();
    } catch (e) {
      const msg = typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e);
      setError(msg || 'Failed to update outcome');
    } finally {
      setUpdating(false);
    }
  };

  const handleDispatch = async (isAnalystApproved = false) => {
    setUpdating(true);
    try {
      const res = await apiClient(`/api/v1/predictions/${predictionId}/dispatch/`, {
        method: 'POST',
        body: JSON.stringify(isAnalystApproved ? { analyst_approved: true } : {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.detail || `Dispatch failed (${res.status})`);
      }
      // If dispatch succeeded, the backend may have changed the outcome to PENDING or generated a package
      await load();
    } catch (e) {
      const msg = typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e);
      setError(msg || 'Dispatch failed');
    } finally {
      setUpdating(false);
    }
  };

  if (loading && !prediction) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: isLight ? 'transparent' : '#000' }}>
      <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
    </div>
  );

  if (error || !prediction) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ background: isLight ? 'transparent' : '#000' }}>
      <AlertTriangle className="w-12 h-12 text-red-400" />
      <p className={`font-bold uppercase text-sm ${isLight ? 'text-slate-800' : 'text-white'}`}>
        {typeof error === 'object' ? JSON.stringify(error) : String(error || 'Prediction not found')}
      </p>
      <button onClick={() => navigate('predictions')}
        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-colors ${
          isLight
            ? 'bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900'
            : 'bg-zinc-900 text-zinc-400 hover:text-white'
        }`}>
        ← Back
      </button>
    </div>
  );

  const color = probColor(prediction.probability);
  const complaint = prediction.complaint_summary ?? {};

  return (
    <div className="min-h-[calc(100vh-65px)] p-6 space-y-6" style={{ background: isLight ? 'transparent' : 'linear-gradient(135deg,#000,#0a0a0a)' }}>

      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('predictions')}
          className="text-[10px] font-black text-zinc-600 hover:text-white uppercase transition-colors flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" /> Predictions
        </button>
        <span className="text-zinc-800">/</span>
        <span className="text-[10px] font-black text-orange-400 uppercase">Intelligence Report</span>
      </div>

      {/* Analyst Review Queue Banner */}
      {prediction.outcome === 'NEEDS_REVIEW' && (
        <AnalystReviewBanner 
          processing={updating}
          onApprove={() => handleDispatch(true)}
          onReject={() => handleOutcomeUpdate('FALSE_ALARM')}
        />
      )}

      {/* Title row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">
            {typeof prediction.predicted_zone_name === 'object' && prediction.predicted_zone_name !== null ? (prediction.predicted_zone_name.name || JSON.stringify(prediction.predicted_zone_name)) : String(prediction.predicted_zone_name ?? '—')}
          </h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">
            Rank #{prediction.rank || 1} · {prediction.model_version || 'XGB-CrimeCast-v1'} · {complaint.complaint_number || ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <OutcomeBadge outcome={prediction.outcome} />
          {(prediction.outcome === 'PENDING' || prediction.outcome === 'NEEDS_REVIEW') && (
            <button onClick={() => setShowOutcome(true)} disabled={updating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all"
              style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)', color: 'black' }}>
              {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Update Outcome
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left 2/3 ──────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Intelligence Dispatch Panel */}
          <IntelligenceDispatch 
            prediction={prediction} 
            dispatching={updating} 
            onDispatch={handleDispatch} 
          />

          {/* Gemini Investigation Brief */}
          <div className="rounded-2xl border border-orange-500/20 p-6 space-y-4"
               style={{ background: 'rgba(249,115,22,0.03)', backdropFilter: 'blur(12px)' }}>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-400" />
              <h2 className="text-[10px] font-black text-orange-400 uppercase tracking-widest">
                AI Investigation Brief
              </h2>
              <button
                onClick={handleRegenerateBrief}
                disabled={briefLoading}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)', color: '#f97316' }}>
                {briefLoading
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
                  : <><Zap className="w-3 h-3" /> Regenerate Brief</>}
              </button>
            </div>
            <BriefRenderer text={prediction.gemini_brief} />
          </div>

          {/* SHAP Feature Importance */}
          <div className="rounded-2xl border border-zinc-800/60 p-6 space-y-4"
               style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-zinc-500" />
              <h2 className="text-[10px] font-black text-orange-400 uppercase tracking-widest">
                Feature Importance (SHAP)
              </h2>
            </div>
            <ShapChart shap={prediction.feature_importance_json} />
          </div>
        </div>

        {/* ── Right 1/3 ─────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Probability card */}
          <div className="rounded-2xl border p-5 space-y-3 text-center"
               style={{ borderColor: `${color}40`, background: `${color}08` }}>
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Probability</p>
            <p className="text-6xl font-black" style={{ color }}>
              {(Number(prediction.probability || 0) * 100).toFixed(0)}%
            </p>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full rounded-full"
                   style={{ width: `${(Number(prediction.probability || 0) * 100).toFixed(0)}%`,
                            background: `linear-gradient(90deg,${color},#ef4444)` }} />
            </div>
          </div>

          {/* Zone info */}
          <div className="rounded-2xl border border-zinc-800/60 p-5 space-y-4"
               style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}>
            <h2 className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Zone Details</h2>
            <div className="space-y-3">
              {[
                { icon: MapPin,  label: 'Zone',   val: typeof prediction.predicted_zone_name === 'object' && prediction.predicted_zone_name !== null ? (prediction.predicted_zone_name.name || JSON.stringify(prediction.predicted_zone_name)) : String(prediction.predicted_zone_name ?? 'N/A') },
                { icon: MapPin,  label: 'Lat/Lon', val: prediction.predicted_lat != null && prediction.predicted_lon != null ? `${Number(prediction.predicted_lat).toFixed(4)}, ${Number(prediction.predicted_lon).toFixed(4)}` : 'N/A' },
                { icon: Clock,   label: 'ETA',    val: prediction.eta_hours != null ? `${prediction.eta_hours}h from fraud time` : 'N/A' },
                { icon: Zap,     label: 'Rank',   val: prediction.rank != null ? `#${prediction.rank} of 5` : 'N/A' },
              ].map(({ icon: Icon, label, val }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ background: 'rgba(249,115,22,0.10)' }}>
                    <Icon className="w-3 h-3 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-zinc-600 uppercase">{label}</p>
                    <p className="text-[11px] font-bold text-white">{val}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Mini static map link */}
            <a href={`https://www.google.com/maps?q=${prediction.predicted_lat},${prediction.predicted_lon}`}
               target="_blank" rel="noopener noreferrer"
               className="block w-full py-2 rounded-xl text-[9px] font-black uppercase text-center border border-zinc-700 text-zinc-400 hover:text-white hover:border-orange-500/40 transition-colors">
              Open in Google Maps ↗
            </a>
          </div>

          {/* Back to complaint */}
          {complaint.id && (
            <button onClick={() => navigate(`complaints/${complaint.id}`)}
              className="w-full py-2.5 rounded-xl border border-zinc-800 text-[9px] font-black uppercase text-zinc-500 hover:text-white hover:border-orange-500/30 transition-colors">
              ← View Complaint
            </button>
          )}
        </div>
      </div>

      {showOutcome && (
        <OutcomeModal
          current={prediction.outcome}
          onClose={() => setShowOutcome(false)}
          onConfirm={handleOutcomeUpdate}
        />
      )}
    </div>
  );
};

export default PredictionDetail;
