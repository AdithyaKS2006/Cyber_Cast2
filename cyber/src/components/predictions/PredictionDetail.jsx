/**
 * PredictionDetail.jsx — CrimeCast
 * Shows full prediction record including Gemini investigation brief,
 * SHAP feature importance chart, zone map, outcome actions,
 * and the new Intelligence Dispatch & Analyst Review Queue.
 */
import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Zap, MapPin, Clock, CheckCircle,
  AlertTriangle, Loader2, Shield, TrendingUp, X, Send, UserCheck, Activity, Copy, Check,
  Radio, Smartphone, Network, Compass, CheckCircle2, Layers
} from 'lucide-react';
import apiClient from '../../utils/apiClient';
import useTheme from '../../hooks/useTheme';

/* ── Helpers ─────────────────────────────────────────────────────────── */
const probColor = (p) =>
  p >= 0.15 ? '#ef4444' : p >= 0.12 ? '#f97316' : '#eab308';

const OutcomeBadge = ({ outcome, isLight }) => {
  const mapDark = {
    PENDING:     'bg-orange-900/30 text-orange-400 border-orange-500/30',
    INTERCEPTED: 'bg-green-900/30  text-green-400  border-green-500/30',
    MISSED:      'bg-red-900/30    text-red-400    border-red-500/30',
    FALSE_ALARM: 'bg-zinc-800/40   text-zinc-500   border-zinc-600/30',
    NEEDS_REVIEW:'bg-yellow-900/30 text-yellow-400 border-yellow-500/30',
  };
  const mapLight = {
    PENDING:     'bg-orange-100 text-orange-700 border-orange-300',
    INTERCEPTED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    MISSED:      'bg-rose-100 text-rose-700 border-rose-300',
    FALSE_ALARM: 'bg-slate-100 text-slate-600 border-slate-300',
    NEEDS_REVIEW:'bg-amber-100 text-amber-800 border-amber-300',
  };
  const map = isLight ? mapLight : mapDark;
  return (
    <span className={`px-3 py-1 rounded-full text-[9px] font-black border uppercase shadow-sm ${map[outcome] || map.PENDING}`}>
      {outcome?.replace('_', ' ')}
    </span>
  );
};

/* ── SHAP horizontal bar chart ───────────────────────────────────────── */
const ShapChart = ({ shap, isLight }) => {
  if (!shap || !Object.keys(shap).length) {
    return (
      <div className={`text-[10px] font-bold uppercase italic py-4 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>
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
            <span className={`text-[9px] font-bold uppercase w-36 flex-shrink-0 truncate ${
              isLight ? 'text-slate-600' : 'text-zinc-500'
            }`}>
              {feat.replace(/_/g, ' ')}
            </span>
            <div className={`flex-1 h-2 rounded-full overflow-hidden ${
              isLight ? 'bg-slate-200' : 'bg-zinc-800'
            }`}>
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
          <span className={`text-[8px] font-bold uppercase ${isLight ? 'text-slate-600' : 'text-zinc-600'}`}>
            Increases risk
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
          <span className={`text-[8px] font-bold uppercase ${isLight ? 'text-slate-600' : 'text-zinc-600'}`}>
            Decreases risk
          </span>
        </div>
      </div>
    </div>
  );
};

/* ── Gemini brief renderer (markdown-lite) ───────────────────────────── */
const BriefRenderer = ({ text, isLight }) => {
  if (!text) return (
    <p className={`text-[10px] font-bold uppercase italic ${isLight ? 'text-slate-400' : 'text-zinc-600'}`}>
      Brief not yet generated.
    </p>
  );
  const cleanText = text.replace(/\uFFFD/g, '');
  const parts = cleanText.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className={`space-y-3 text-[11px] leading-relaxed ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <p key={i} className="text-[10px] font-black text-orange-500 uppercase tracking-widest mt-4 first:mt-0">
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
                <span className={isLight ? 'text-slate-700' : 'text-zinc-300'}>{line.replace(/^[•\-]\s*/, '')}</span>
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
const OutcomeModal = ({ current, onClose, onConfirm, isLight }) => {
  const options = [
    { value: 'INTERCEPTED', label: 'Intercepted ✓', color: '#16a34a' },
    { value: 'MISSED',      label: 'Missed',        color: '#dc2626' },
    { value: 'FALSE_ALARM', label: 'False Alarm',   color: '#64748b' },
  ].filter(o => o.value !== current);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`w-80 rounded-2xl border p-6 space-y-4 shadow-2xl ${
        isLight ? 'bg-white border-slate-200' : 'border-orange-500/30 bg-zinc-950'
      }`}>
        <div className="flex justify-between items-center">
          <h3 className={`text-sm font-black uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>Update Outcome</h3>
          <button onClick={onClose}><X className={`w-4 h-4 ${isLight ? 'text-slate-400 hover:text-slate-700' : 'text-zinc-500 hover:text-white'}`} /></button>
        </div>
        <div className="space-y-2">
          {options.map(o => (
            <button key={o.value} onClick={() => onConfirm(o.value)}
              className="w-full py-3 rounded-xl text-[10px] font-black uppercase transition-all hover:opacity-90"
              style={{ background: `${o.color}15`, border: `1px solid ${o.color}40`, color: o.color }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ── Analyst Review Banner ───────────────────────────────────────────── */
const AnalystReviewBanner = ({ onApprove, onReject, processing, isLight }) => (
  <div className={`rounded-2xl border p-5 flex flex-col md:flex-row items-center justify-between gap-4 transition-all ${
    isLight
      ? 'border-yellow-400/80 bg-gradient-to-r from-amber-50 to-white shadow-sm'
      : 'border-yellow-500/40'
  }`}
  style={isLight ? {} : { background: 'linear-gradient(90deg, rgba(234,179,8,0.1), rgba(0,0,0,0))' }}>
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-full border ${isLight ? 'bg-amber-100 border-amber-300' : 'bg-yellow-500/20 border-yellow-500/30'}`}>
        <UserCheck className={`w-6 h-6 ${isLight ? 'text-amber-600' : 'text-yellow-400'}`} />
      </div>
      <div>
        <h2 className={`text-sm font-black uppercase tracking-widest ${isLight ? 'text-amber-800' : 'text-yellow-400'}`}>Analyst Review Queue</h2>
        <p className={`text-[10px] mt-1 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>This prediction's confidence is below the auto-dispatch threshold. Manual review required.</p>
      </div>
    </div>
    <div className="flex gap-3 w-full md:w-auto">
      <button 
        onClick={onReject} 
        disabled={processing}
        className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase border disabled:opacity-50 transition-colors ${
          isLight
            ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
            : 'border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`}>
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
const IntelligenceDispatch = ({ prediction, onDispatch, dispatching, isLight }) => {
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
      <div className={`rounded-2xl border p-6 space-y-6 relative overflow-hidden transition-all ${
        isLight
          ? 'bg-white border-emerald-300/80 shadow-sm'
          : 'border-emerald-500/30'
      }`}
      style={{
        background: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(12px)'
      }}>
        
        {/* Ambient glow */}
        <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none ${
          isLight ? 'bg-emerald-500/10' : 'bg-emerald-500/5'
        }`} />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg border ${
              isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/20 border-emerald-500/30'
            }`}>
              <Send className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h2 className={`text-[12px] font-black uppercase tracking-widest ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}>
                Intelligence Package
              </h2>
              <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                ID: {String(pkg.id || '').split('-')[0].toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
              isLight
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}>
              ⚡ [SIMULATED DELIVERY]
            </span>
            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
              isLight
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
            }`}>
              Active · {pkg.status}
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
          <div className={`p-4 rounded-xl border space-y-3 transition-colors ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 hover:border-orange-400'
              : 'bg-zinc-900/60 border-zinc-800 hover:border-orange-500/30'
          }`}>
            <h3 className={`text-[10px] font-bold uppercase pb-2 border-b ${
              isLight ? 'text-slate-500 border-slate-200' : 'text-zinc-500 border-zinc-800'
            }`}>
              Bank Alerts ({pkg.bank_alerts?.length || 0})
            </h3>
            <div className="space-y-2">
              {pkg.bank_alerts?.map(a => (
                <div key={a.id} className="flex justify-between items-center text-xs">
                  <span className={`truncate pr-2 font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>
                    {a.target_institution}
                  </span>
                  <span className="text-orange-500 font-bold text-[9px] bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className={`p-4 rounded-xl border space-y-3 transition-colors ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 hover:border-blue-400'
              : 'bg-zinc-900/60 border-zinc-800 hover:border-blue-500/30'
          }`}>
            <h3 className={`text-[10px] font-bold uppercase pb-2 border-b ${
              isLight ? 'text-slate-500 border-slate-200' : 'text-zinc-500 border-zinc-800'
            }`}>
              ATM Alerts ({pkg.atm_alerts?.length || 0})
            </h3>
            <div className="space-y-2">
              {pkg.atm_alerts?.map(a => (
                <div key={a.id} className="flex justify-between items-center text-xs">
                  <span className={`truncate pr-2 font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>
                    {a.target_network}
                  </span>
                  <span className="text-blue-500 font-bold text-[9px] bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className={`p-4 rounded-xl border space-y-3 transition-colors ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 hover:border-emerald-400'
              : 'bg-zinc-900/60 border-zinc-800 hover:border-emerald-500/30'
          }`}>
            <h3 className={`text-[10px] font-bold uppercase pb-2 border-b ${
              isLight ? 'text-slate-500 border-slate-200' : 'text-zinc-500 border-zinc-800'
            }`}>
              LEA Dispatches ({pkg.lea_dispatches?.length || 0})
            </h3>
            <div className="space-y-2">
              {pkg.lea_dispatches?.map(a => (
                <div key={a.id} className="flex justify-between items-center text-xs">
                  <span className={`truncate pr-2 font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>
                    {a.target_officer_id || a.target_district || 'Nodal Officer'}
                  </span>
                  <span className="text-emerald-500 font-bold text-[9px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`mt-4 pt-4 border-t relative z-10 ${isLight ? 'border-slate-200' : 'border-zinc-800'}`}>
          <h3 className={`text-[10px] font-black uppercase tracking-widest mb-3 ${
            isLight ? 'text-slate-700' : 'text-zinc-500'
          }`}>
            Integration Payloads (I4C/NCRP Compliant)
          </h3>
          <div className={`max-h-56 overflow-y-auto p-3 rounded-xl border font-mono text-[9px] space-y-4 ${
            isLight
              ? 'bg-slate-950 border-slate-800 text-emerald-400 shadow-inner'
              : 'bg-black/60 border-zinc-800 text-emerald-500/80'
          }`}>
            {pkg.bank_alerts?.map(a => a.payload && (
              <div key={a.id} className={`relative group border rounded-xl p-2.5 ${
                isLight ? 'border-slate-800/80 bg-slate-950/60' : 'border-zinc-800/60 bg-black/40'
              }`}>
                <div className={`flex flex-wrap justify-between items-center gap-2 mb-2 pb-1 border-b ${
                  isLight ? 'border-slate-800' : 'border-zinc-800/60'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-orange-400 font-bold"># BANK_{a.target_institution.toUpperCase()}_PAYLOAD</span>
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
                    className="flex items-center gap-1 text-[8px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700"
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
                  <span className="text-blue-400/90 font-bold"># ATM_{a.target_network.toUpperCase()}_PAYLOAD</span>
                  <button onClick={() => handleCopy(a.payload, a.id)} className="flex items-center gap-1 text-[8px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700">
                    {copiedId === a.id ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy JSON</>}
                  </button>
                </div>
                <pre className="overflow-x-auto text-[9px] leading-tight">{JSON.stringify(a.payload, null, 2)}</pre>
              </div>
            ))}
            {pkg.lea_dispatches?.map(a => a.payload && (
              <div key={a.id} className="relative group">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-emerald-400/90 font-bold"># LEA_{(a.target_officer_id || a.target_district || 'OFFICER').toUpperCase()}_PAYLOAD</span>
                  <button onClick={() => handleCopy(a.payload, a.id)} className="flex items-center gap-1 text-[8px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700">
                    {copiedId === a.id ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy JSON</>}
                  </button>
                </div>
                <pre className="overflow-x-auto text-[9px] leading-tight">{JSON.stringify(a.payload, null, 2)}</pre>
              </div>
            ))}
          </div>
        </div>

        <div className={`pt-6 border-t relative z-10 ${isLight ? 'border-slate-200' : 'border-zinc-800'}`}>
          <h3 className={`text-[10px] font-black uppercase mb-4 tracking-widest flex items-center gap-2 ${
            isLight ? 'text-slate-700' : 'text-zinc-500'
          }`}>
            <Activity className="w-3 h-3 text-emerald-500" /> Audit Timeline
          </h3>
          <div className="space-y-0 pl-1">
            {pkg.audit_logs?.map((log, i) => (
              <div key={log.id} className="flex gap-4 relative pb-5">
                {/* Vertical line connecting nodes */}
                {i < pkg.audit_logs.length - 1 && (
                  <div className={`absolute left-[3px] top-2 bottom-[-10px] w-px ${isLight ? 'bg-slate-300' : 'bg-zinc-800'}`} />
                )}
                {/* Node */}
                <div className="relative z-10 mt-1">
                  <div className="w-[7px] h-[7px] rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                </div>
                {/* Content */}
                <div className="-mt-1">
                  <p className={`text-[9px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                    {new Date(log.timestamp).toLocaleTimeString()} · {new Date(log.timestamp).toLocaleDateString()}
                  </p>
                  <p className={`text-[11px] font-black uppercase mt-0.5 tracking-tight ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}>
                    {log.action.replace(/_/g, ' ')}
                  </p>
                  <p className={`text-[10px] mt-1 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                    {typeof log.details === 'object' && log.details !== null ? JSON.stringify(log.details) : String(log.details ?? '')}
                  </p>
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
    <div className={`rounded-2xl border p-6 space-y-6 transition-all ${
      isLight ? 'bg-white border-slate-200 shadow-sm' : 'border-zinc-800'
    }`}
    style={{
      background: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(12px)'
    }}>
      <div className="flex items-center gap-2">
        <Send className="w-5 h-5 text-orange-500" />
        <h2 className={`text-[12px] font-black uppercase tracking-widest ${
          isLight ? 'text-slate-900' : 'text-white'
        }`}>
          Intelligence Dispatch
        </h2>
      </div>
      <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
        Ready to broadcast threat intelligence package to transaction banks, ATM networks, and local nodal officers.
      </p>
      
      <button 
        onClick={() => onDispatch(false)} 
        disabled={isNeedsReview || dispatching}
        className={`w-full py-4 rounded-xl text-[12px] font-black uppercase transition-all flex items-center justify-center gap-2 ${
          isNeedsReview 
            ? (isLight ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' : 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed')
            : 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:opacity-90 shadow-[0_0_20px_rgba(249,115,22,0.3)]'
        }`}
      >
        {dispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {isNeedsReview ? 'Analyst Review Required' : 'Dispatch Intelligence Package'}
      </button>
    </div>
  );
};

/* ── ISP & Telecom Triangulation Panel ────────────────────────────────── */
const ISPLocationPanel = ({ isp, isLight }) => {
  const [copied, setCopied] = useState(false);
  if (!isp) return null;

  const copyCoords = () => {
    navigator.clipboard.writeText(`${isp.cell_tower_lat}, ${isp.cell_tower_lon}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl border p-6 space-y-5 transition-all ${
      isLight ? 'bg-white border-blue-200/80 shadow-sm' : 'border-blue-500/20 bg-blue-950/10 backdrop-blur-xl'
    }`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0">
            <Radio className="w-4 h-4 animate-pulse text-blue-400" />
          </div>
          <div>
            <h2 className="text-[11px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
              ISP & Telecom Triangulation
              <span className="px-2 py-0.5 rounded-full text-[8px] bg-blue-500/20 text-blue-300 border border-blue-500/40">
                LIVE CDR TELEMETRY
              </span>
            </h2>
            <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
              Cell tower sector azimuth & IP gateway matching suspect hardware
            </p>
          </div>
        </div>
        <button
          onClick={copyCoords}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all flex-shrink-0 self-start sm:self-auto ${
            isLight
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700'
          }`}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied Tower Coords' : 'Copy Tower Coords'}
        </button>
      </div>

      {/* Grid of telecom attributes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900/60 border-zinc-800'}`}>
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <Network className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[8px] font-black uppercase">Carrier / ISP</span>
          </div>
          <p className={`text-[11px] font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{isp.isp_provider}</p>
          <p className="text-[9px] text-blue-400 font-medium">{isp.telecom_circle}</p>
        </div>

        <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900/60 border-zinc-800'}`}>
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[8px] font-black uppercase">Serving Cell Tower</span>
          </div>
          <p className={`text-[11px] font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{isp.cell_tower_id}</p>
          <p className="text-[9px] text-cyan-400 font-medium">{isp.cell_sector_azimuth}</p>
        </div>

        <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900/60 border-zinc-800'}`}>
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <Compass className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[8px] font-black uppercase">Tower Coordinates</span>
          </div>
          <p className={`text-[11px] font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {isp.cell_tower_lat}, {isp.cell_tower_lon}
          </p>
          <p className="text-[9px] text-orange-400 font-medium">~{isp.tower_to_atm_distance_km} km to target ATM cluster</p>
        </div>

        <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900/60 border-zinc-800'}`}>
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <Smartphone className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[8px] font-black uppercase">Tracked Device IMEI</span>
          </div>
          <p className={`text-[11px] font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{isp.tracked_imei}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
              {isp.sim_reuse_count} SIMs Seen
            </span>
            <span className="text-[8px] text-zinc-400">Age: {isp.sim_activation_days}d</span>
          </div>
        </div>

        <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900/60 border-zinc-800'}`}>
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <Network className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[8px] font-black uppercase">Suspect Gateway IP</span>
          </div>
          <p className={`text-[11px] font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{isp.gateway_ip}</p>
          <p className="text-[9px] text-emerald-400 font-medium">{isp.is_vpn_or_proxy ? '⚠️ VPN/Proxy Gateway Detected' : 'Direct ISP Mobile Gateway'}</p>
        </div>

        <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900/60 border-zinc-800'}`}>
          <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[8px] font-black uppercase">Device Burn Profile</span>
          </div>
          <p className="text-[11px] font-black text-rose-400">{isp.device_burn_risk}</p>
          <p className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>{isp.signal_timestamp}</p>
        </div>
      </div>

      {/* Cross link to map */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border ${
        isLight ? 'bg-blue-50/60 border-blue-200 text-blue-900' : 'bg-blue-950/20 border-blue-800/40 text-blue-200'
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-base">📍</span>
          <span className="text-[10px] font-bold">
            Suspect cell sector covers {isp.telecom_circle}. Azimuth orientation intersects candidate cash-out ATM corridor.
          </span>
        </div>
        <a
          href={`https://www.google.com/maps?q=${isp.cell_tower_lat},${isp.cell_tower_lon}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] font-black uppercase text-blue-400 hover:text-blue-300 underline underline-offset-2 flex-shrink-0"
        >
          View Tower Map ↗
        </a>
      </div>
    </div>
  );
};

/* ── Why This Zone? (Attribution Proof Methods) Panel ─────────────────── */
const MethodExplanationPanel = ({ explanation, isLight }) => {
  if (!explanation || !explanation.proof_methods) return null;

  return (
    <div className={`rounded-2xl border p-6 space-y-5 transition-all ${
      isLight ? 'bg-white border-amber-200/80 shadow-sm' : 'border-amber-500/20 bg-amber-950/10 backdrop-blur-xl'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-[11px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
              Why This Zone? (Attribution Proof Methods)
              <span className="px-2 py-0.5 rounded-full text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                5 CORROBORATING METHODS
              </span>
            </h2>
            <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
              Mathematical & empirical proof confirming why this specific zone is the right cash-out target
            </p>
          </div>
        </div>
      </div>

      <div className={`p-3.5 rounded-xl border text-[11px] font-medium leading-relaxed ${
        isLight ? 'bg-amber-50/70 border-amber-200 text-amber-950' : 'bg-amber-900/15 border-amber-700/40 text-amber-200'
      }`}>
        <span className="font-black text-amber-400 mr-1.5 uppercase text-[9px] tracking-wider">Verdict:</span>
        {explanation.primary_verdict}
      </div>

      {/* 5 Corroborated Methods */}
      <div className="space-y-3">
        {explanation.proof_methods.map((method, idx) => (
          <div
            key={method.code || idx}
            className={`p-4 rounded-xl border transition-all ${
              isLight ? 'bg-slate-50 hover:bg-slate-100/80 border-slate-200' : 'bg-zinc-900/60 hover:bg-zinc-900 border-zinc-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 font-black text-[9px] flex items-center justify-center flex-shrink-0">
                  #{idx + 1}
                </span>
                <span className={`text-[11px] font-black uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {method.title}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  {method.weight}
                </span>
                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                  method.status === 'ACTIONABLE'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  ✓ {method.status}
                </span>
              </div>
            </div>
            <p className={`text-[10px] leading-relaxed pl-7 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
              {method.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Candidate Target ATMs Panel (Micro-GIS Hotspot) ────────────────── */
const CandidateATMsPanel = ({ atms, isp, isLight }) => {
  if (!atms || !atms.length) return null;

  return (
    <div className={`rounded-2xl border p-6 space-y-5 transition-all ${
      isLight ? 'bg-white border-emerald-200/80 shadow-sm' : 'border-emerald-500/20 bg-emerald-950/10 backdrop-blur-xl'
    }`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
            <MapPin className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
              Micro-GIS Target ATMs
              <span className="px-2 py-0.5 rounded-full text-[8px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {atms.length} CANDIDATE CASH-OUT TERMINALS
              </span>
            </h2>
            <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
              High-risk cash dispense terminals pinpointed within serving cell tower coverage zone
            </p>
          </div>
        </div>
      </div>

      {/* ATMs List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {atms.map((atm, idx) => {
          const isPrimary = idx === 0;
          return (
            <div
              key={atm.atm_id || idx}
              className={`p-4 rounded-xl border relative transition-all ${
                isPrimary
                  ? (isLight ? 'bg-emerald-50/80 border-emerald-300 ring-1 ring-emerald-400/40' : 'bg-emerald-900/20 border-emerald-500/50 ring-1 ring-emerald-500/30')
                  : (isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-900/60 border-zinc-800')
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                    isPrimary
                      ? 'bg-emerald-500 text-black'
                      : (isLight ? 'bg-slate-200 text-slate-700' : 'bg-zinc-800 text-zinc-300')
                  }`}>
                    {isPrimary ? 'PRIMARY TARGET' : `ALT #${idx + 1}`}
                  </span>
                  <span className={`text-[11px] font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {atm.bank}
                  </span>
                </div>
                <span className={`text-[9px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                  {atm.atm_id}
                </span>
              </div>

              <p className={`text-[10px] mb-2 leading-relaxed ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                {atm.address}
              </p>

              <div className={`flex items-center justify-between text-[9px] pt-2 border-t ${
                isLight ? 'border-slate-200' : 'border-zinc-800/40'
              }`}>
                <span className={`font-mono ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                  {atm.lat}, {atm.lon}
                </span>
                {isp && isPrimary ? (
                  <span className="text-emerald-400 font-bold">
                    ~{isp.tower_to_atm_distance_km} km to cell tower
                  </span>
                ) : null}
                <a
                  href={`https://www.google.com/maps/dir/${isp ? `${isp.cell_tower_lat},${isp.cell_tower_lon}` : ''}/${atm.lat},${atm.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-orange-400 hover:text-orange-300 underline underline-offset-2 ml-auto"
                >
                  Direct Route ↗
                </a>
              </div>
            </div>
          );
        })}
      </div>
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
          className={`text-[10px] font-black uppercase transition-colors flex items-center gap-1 ${
            isLight ? 'text-slate-600 hover:text-slate-900' : 'text-zinc-600 hover:text-white'
          }`}>
          <ChevronLeft className="w-3.5 h-3.5" /> Predictions
        </button>
        <span className={isLight ? 'text-slate-300' : 'text-zinc-800'}>/</span>
        <span className="text-[10px] font-black text-orange-500 uppercase">Intelligence Report</span>
      </div>

      {/* Analyst Review Queue Banner */}
      {prediction.outcome === 'NEEDS_REVIEW' && (
        <AnalystReviewBanner 
          processing={updating}
          onApprove={() => handleDispatch(true)}
          onReject={() => handleOutcomeUpdate('FALSE_ALARM')}
          isLight={isLight}
        />
      )}

      {/* Title row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-black uppercase tracking-tight ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}>
            {typeof prediction.predicted_zone_name === 'object' && prediction.predicted_zone_name !== null ? (prediction.predicted_zone_name.name || JSON.stringify(prediction.predicted_zone_name)) : String(prediction.predicted_zone_name ?? '—')}
          </h1>
          <p className={`text-[10px] font-bold uppercase mt-1 ${
            isLight ? 'text-slate-500' : 'text-zinc-500'
          }`}>
            Rank #{prediction.rank || 1} · {prediction.model_version || 'XGB-CrimeCast-v1'} · {complaint.complaint_number || ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <OutcomeBadge outcome={prediction.outcome} isLight={isLight} />
          {(prediction.outcome === 'PENDING' || prediction.outcome === 'NEEDS_REVIEW') && (
            <button onClick={() => setShowOutcome(true)} disabled={updating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all shadow-md"
              style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)', color: 'white' }}>
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
            isLight={isLight}
          />

          {/* ISP & Telecom Triangulation Panel */}
          {prediction.isp_telecom_location && (
            <ISPLocationPanel 
              isp={prediction.isp_telecom_location} 
              isLight={isLight} 
            />
          )}

          {/* Attribution Proof Methods Explanation */}
          {prediction.method_explanation && (
            <MethodExplanationPanel 
              explanation={prediction.method_explanation} 
              isLight={isLight} 
            />
          )}

          {/* Micro-GIS Target Candidate ATMs Panel */}
          {prediction.candidate_atms && prediction.candidate_atms.length > 0 && (
            <CandidateATMsPanel
              atms={prediction.candidate_atms}
              isp={prediction.isp_telecom_location}
              isLight={isLight}
            />
          )}

          {/* Gemini Investigation Brief */}
          <div className={`rounded-2xl border p-6 space-y-4 transition-all ${
            isLight ? 'bg-white border-orange-200/80 shadow-sm' : 'border-orange-500/20'
          }`}
          style={{ background: isLight ? '#ffffff' : 'rgba(249,115,22,0.03)', backdropFilter: 'blur(12px)' }}>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-500" />
              <h2 className="text-[10px] font-black text-orange-500 uppercase tracking-widest">
                AI Investigation Brief
              </h2>
              <button
                onClick={handleRegenerateBrief}
                disabled={briefLoading}
                className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all hover:opacity-90 disabled:opacity-50 ${
                  isLight
                    ? 'bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700'
                    : ''
                }`}
                style={isLight ? {} : { background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)', color: '#f97316' }}>
                {briefLoading
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
                  : <><Zap className="w-3 h-3" /> Regenerate Brief</>}
              </button>
            </div>
            <BriefRenderer text={prediction.gemini_brief} isLight={isLight} />
          </div>

          {/* SHAP Feature Importance */}
          <div className={`rounded-2xl border p-6 space-y-4 transition-all ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'border-zinc-800/60'
          }`}
          style={{ background: isLight ? '#ffffff' : 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}>
            <div className="flex items-center gap-2">
              <TrendingUp className={`w-4 h-4 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`} />
              <h2 className="text-[10px] font-black text-orange-500 uppercase tracking-widest">
                Feature Importance (SHAP)
              </h2>
            </div>
            <ShapChart shap={prediction.feature_importance_json} isLight={isLight} />
          </div>
        </div>

        {/* ── Right 1/3 ─────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Probability card */}
          <div className={`rounded-2xl border p-5 space-y-3 text-center transition-all ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : ''
          }`}
          style={{ borderColor: isLight ? undefined : `${color}40`, background: isLight ? '#ffffff' : `${color}08` }}>
            <p className={`text-[9px] font-black uppercase tracking-widest ${
              isLight ? 'text-slate-500' : 'text-zinc-600'
            }`}>
              Probability
            </p>
            <p className="text-6xl font-black" style={{ color }}>
              {(Number(prediction.probability || 0) * 100).toFixed(0)}%
            </p>
            <div className={`h-2 rounded-full overflow-hidden ${
              isLight ? 'bg-slate-200' : 'bg-zinc-800'
            }`}>
              <div className="h-full rounded-full"
                   style={{ width: `${(Number(prediction.probability || 0) * 100).toFixed(0)}%`,
                            background: `linear-gradient(90deg,${color},#ef4444)` }} />
            </div>
          </div>

          {/* Quick ISP Signal Card */}
          {prediction.isp_telecom_location && (
            <div className={`rounded-2xl border p-5 space-y-3 ${
              isLight ? 'bg-white border-blue-200' : 'border-blue-500/20 bg-blue-950/15'
            }`}>
              <div className="flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                  Active Cell Sector
                </h3>
              </div>
              <div className="space-y-1.5 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">ISP:</span>
                  <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>
                    {prediction.isp_telecom_location.isp_provider}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">Cell ID:</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {prediction.isp_telecom_location.cell_tower_id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">Azimuth:</span>
                  <span className="font-mono text-orange-400 font-bold">
                    {prediction.isp_telecom_location.cell_sector_azimuth}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">Proximity to ATM:</span>
                  <span className="font-bold text-emerald-400">
                    ~{prediction.isp_telecom_location.tower_to_atm_distance_km} km
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Zone info */}
          <div className={`rounded-2xl border p-5 space-y-4 transition-all ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'border-zinc-800/60'
          }`}
          style={{ background: isLight ? '#ffffff' : 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}>
            <h2 className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Zone Details</h2>
            <div className="space-y-3">
              {[
                { icon: MapPin,  label: 'Zone',   val: typeof prediction.predicted_zone_name === 'object' && prediction.predicted_zone_name !== null ? (prediction.predicted_zone_name.name || JSON.stringify(prediction.predicted_zone_name)) : String(prediction.predicted_zone_name ?? 'N/A') },
                { icon: MapPin,  label: 'Lat/Lon', val: prediction.predicted_lat != null && prediction.predicted_lon != null ? `${Number(prediction.predicted_lat).toFixed(4)}, ${Number(prediction.predicted_lon).toFixed(4)}` : 'N/A' },
                { icon: Clock,   label: 'ETA',    val: prediction.eta_hours != null ? `${prediction.eta_hours}h from fraud time` : 'N/A' },
                { icon: Zap,     label: 'Rank',   val: prediction.rank != null ? `#${prediction.rank} of 5` : 'N/A' },
              ].map(({ icon: Icon, label, val }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ background: isLight ? 'rgba(249,115,22,0.12)' : 'rgba(249,115,22,0.10)' }}>
                    <Icon className="w-3 h-3 text-orange-500" />
                  </div>
                  <div>
                    <p className={`text-[8px] font-black uppercase ${isLight ? 'text-slate-400' : 'text-zinc-600'}`}>{label}</p>
                    <p className={`text-[11px] font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{val}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Mini static map link */}
            <a href={`https://www.google.com/maps?q=${prediction.predicted_lat},${prediction.predicted_lon}`}
               target="_blank" rel="noopener noreferrer"
               className={`block w-full py-2 rounded-xl text-[9px] font-black uppercase text-center border transition-colors ${
                 isLight
                   ? 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 hover:border-orange-400'
                   : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-orange-500/40'
               }`}>
              Open in Google Maps ↗
            </a>
          </div>

          {/* Back to complaint */}
          {complaint.id && (
            <button onClick={() => navigate(`complaints/${complaint.id}`)}
              className={`w-full py-2.5 rounded-xl border text-[9px] font-black uppercase transition-colors ${
                isLight
                  ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 hover:border-orange-400 shadow-sm'
                  : 'border-zinc-800 text-zinc-500 hover:text-white hover:border-orange-500/30'
              }`}>
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
          isLight={isLight}
        />
      )}
    </div>
  );
};

export default PredictionDetail;
