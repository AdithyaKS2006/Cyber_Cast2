import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Zap, Clock, CheckCircle, AlertTriangle,
  ArrowRight, ExternalLink, Loader2, MapPin, Building2,
  DollarSign, Calendar, User, FileText, Network, LayoutDashboard,
  FolderLock, Shield
} from 'lucide-react';

import apiClient from '../../utils/apiClient';
import MoneyTrailGraph from '../intelligence/MoneyTrailGraph';

// ── Status badge ──────────────────────────────────────────────────────────
const STATUS_META = {
  NEW:               { label: 'New',               cls: 'bg-blue-900/30 text-blue-400 border-blue-500/30' },
  UNDER_ANALYSIS:    { label: 'Under Analysis',    cls: 'bg-orange-900/30 text-orange-400 border-orange-500/30' },
  PREDICTION_ACTIVE: { label: 'Prediction Active', cls: 'bg-purple-900/30 text-purple-400 border-purple-500/30' },
  INTERCEPTED:       { label: 'Intercepted',        cls: 'bg-green-900/30 text-green-400 border-green-500/30' },
  CLOSED:            { label: 'Closed',             cls: 'bg-zinc-800/40 text-zinc-500 border-zinc-600/30' },
  FALSE_ALARM:       { label: 'False Alarm',        cls: 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30' },
};

const TIMELINE_STEPS = [
  { key: 'NEW',               label: 'Complaint Filed',      icon: FileText },
  { key: 'UNDER_ANALYSIS',    label: 'Under Analysis',       icon: Zap },
  { key: 'PREDICTION_ACTIVE', label: 'Prediction Generated', icon: MapPin },
  { key: 'INTERCEPTED',       label: 'Intercepted',          icon: CheckCircle },
];

const STATUS_ORDER = ['NEW', 'UNDER_ANALYSIS', 'PREDICTION_ACTIVE', 'INTERCEPTED'];

// ── Sub-components ────────────────────────────────────────────────────────
const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3">
    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
         style={{ background: 'rgba(249,115,22,0.10)' }}>
      <Icon className="w-3.5 h-3.5 text-orange-400" />
    </div>
    <div>
      <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{label}</p>
      <p className="text-[11px] font-bold">{typeof value === 'object' && value !== null ? (value.name || value.label || JSON.stringify(value)) : String(value ?? '—')}</p>
    </div>
  </div>
);

const HopNode = ({ hop, isFirst, isLast }) => (
  <div className="flex flex-col items-center">
    {/* Node */}
    <div className={`w-3 h-3 rounded-full border-2 z-10 ${hop.is_mule_flagged ? 'border-red-500 bg-red-900/40' : 'border-orange-500 bg-orange-900/20'}`} />
    {/* Card */}
    <div className={`mt-1 p-3 rounded-xl border text-center min-w-[110px]
                     ${hop.is_mule_flagged ? 'border-red-500/30 bg-red-900/10' : 'border-zinc-800 bg-zinc-900/50'}`}>
      <p className="text-[9px] font-black text-zinc-400 uppercase truncate max-w-[100px]">{hop.from_bank || 'Bank'}</p>
      <p className="text-[8px] text-zinc-600">{hop.from_account ? `…${hop.from_account.slice(-4)}` : '????'}</p>
      <p className="text-[10px] font-black text-white mt-1">₹{Number(hop.amount || 0).toLocaleString('en-IN')}</p>
      {hop.is_mule_flagged && (
        <span className="text-[7px] font-black text-red-400 uppercase">🚨 Mule</span>
      )}
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────
const ComplaintDetail = ({ complaintId, navigate }) => {
  const [complaint, setComplaint] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!complaintId || complaintId.startsWith(':') || complaintId === 'undefined' || complaintId === 'null') {
      setError('Invalid Complaint ID format.');
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiClient(`/api/v1/complaints/${complaintId}/`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || errData.message || `Failed to load complaint (${res.status})`);
        }
        const data = await res.json();
        setComplaint(data);

        // Try to load existing prediction
        try {
          const predRes = await apiClient(`/api/v1/predictions/?complaint=${complaintId}&limit=1`);
          if (predRes.ok) {
            const preds = await predRes.json();
            const list = preds.results ?? preds;
            if (Array.isArray(list) && list.length > 0) setPrediction(list[0]);
          }
        } catch {}
      } catch (e) {
        const msg = typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e);
        setError(msg || 'Failed to load complaint');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [complaintId]);

  const generatePrediction = async () => {
    setGenerating(true);
    setGenError('');
    try {
      // Trigger the pipeline (returns 202 immediately)
      const genRes = await apiClient('/api/v1/predictions/generate/', {
        method: 'POST',
        body: JSON.stringify({ complaint_id: complaintId }),
      });
      if (!genRes.ok) {
        const errJson = await genRes.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.message || `Pipeline trigger failed (${genRes.status})`);
      }

      // Poll every 2s for up to 30s
      let found = null;
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const predRes = await apiClient(`/api/v1/predictions/?complaint=${complaintId}&limit=1`);
          if (predRes.ok) {
            const preds = await predRes.json();
            const list = preds.results ?? preds;
            if (Array.isArray(list) && list.length > 0) { found = list[0]; break; }
          }
        } catch {}
      }

      if (found) {
        setPrediction(found);
        // Refresh complaint status
        const updateRes = await apiClient(`/api/v1/complaints/${complaintId}/`);
        if (updateRes.ok) {
          const updated = await updateRes.json();
          setComplaint(updated);
        }
      } else {
        setGenError('Prediction pipeline is still running — check back in a moment.');
      }
    } catch (e) {
      const msg = typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e);
      setGenError(msg || 'Failed to generate prediction');
    } finally {
      setGenerating(false);
    }
  };

  const formatDate = (iso) => iso
    ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const currentStatusIdx = STATUS_ORDER.indexOf(complaint?.status);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <AlertTriangle className="w-12 h-12 text-red-400" />
      <p className="font-bold uppercase text-sm">{typeof error === 'object' ? JSON.stringify(error) : String(error)}</p>
      <button onClick={() => navigate('complaints')}
              className="px-4 py-2 rounded-xl cc-card-bg text-zinc-400 text-[10px] font-black uppercase hover:text-white transition-colors">
        ← Back to Complaints
      </button>
    </div>
  );

  const hops = complaint?.transaction_hops ?? [];

  return (
    <div className="space-y-6 pb-12">
      {/* Back + Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('complaints')}
                className="flex items-center gap-1.5 text-zinc-500 hover:text-white text-[10px] font-black uppercase transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" /> Complaints
        </button>
        <div className="w-px h-4 bg-zinc-800" />
        <span className="text-[10px] font-black text-orange-400">{complaint?.complaint_number}</span>
      </div>

      {/* Title row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">{complaint?.victim_name}</h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">
            {complaint?.fraud_method} Fraud • Filed {formatDate(complaint?.complaint_timestamp)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status badge */}
          {complaint?.status && (() => {
            const m = STATUS_META[complaint.status] || STATUS_META.NEW;
            return (
              <span className={`px-3 py-1 rounded-full text-[9px] font-black border uppercase ${m.cls}`}>{m.label}</span>
            );
          })()}

          {/* Generate Prediction button */}
          {!prediction ? (
            <button onClick={generatePrediction} disabled={generating}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)', color: 'black' }}>
              {generating
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
                : <><Zap className="w-3.5 h-3.5" /> Generate Prediction</>}
            </button>
          ) : (
            <button onClick={() => navigate(`predictions/${prediction.id}`)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-purple-500/30 text-[10px] font-black uppercase text-purple-400 hover:bg-purple-500/10 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> View Prediction
            </button>
          )}

          <button onClick={() => navigate(`evidence/${complaintId}`)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-500/40 text-[10px] font-black uppercase text-indigo-400 hover:bg-indigo-500/10 transition-colors">
            <FolderLock className="w-3.5 h-3.5" /> Evidence Locker
          </button>
          <button onClick={() => navigate('freeze-ops')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/40 text-[10px] font-black uppercase text-emerald-400 hover:bg-emerald-500/10 transition-colors">
            <Shield className="w-3.5 h-3.5" /> Freeze Queue
          </button>
        </div>
      </div>


      {/* ── Navigation Tabs ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
            activeTab === 'overview'
              ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20'
              : 'bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab('money-trail')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
            activeTab === 'money-trail'
              ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20'
              : 'bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:text-white'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          Money Trail Graph
        </button>
      </div>

      {genError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-900/20 border border-red-500/30">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <p className="text-[10px] text-red-400 font-bold">{typeof genError === 'object' ? JSON.stringify(genError) : String(genError)}</p>
        </div>
      )}

      {activeTab === 'money-trail' ? (
        <MoneyTrailGraph complaintId={complaintId} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Victim & Fraud info */}
          <div className="cc-card-bg rounded-2xl border border-zinc-800/60 p-6 space-y-6">
            <h2 className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Complaint Details</h2>
            <div className="grid grid-cols-2 gap-5">
              <InfoRow icon={User}       label="Victim Name"    value={complaint?.victim_name} />
              <InfoRow icon={Building2}  label="Location"       value={`${complaint?.victim_district}, ${complaint?.victim_state}`} />
              <InfoRow icon={DollarSign} label="Fraud Amount"   value={`₹${Number(complaint?.fraud_amount || 0).toLocaleString('en-IN')}`} />
              <InfoRow icon={Zap}        label="Fraud Method"   value={complaint?.fraud_method} />
              <InfoRow icon={Calendar}   label="Fraud Occurred" value={formatDate(complaint?.fraud_timestamp)} />
              <InfoRow icon={MapPin}     label="Priority"       value={complaint?.priority} />
            </div>

            <div className="space-y-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Narrative</p>
              <p className="text-[11px] text-zinc-300 leading-relaxed">{complaint?.narrative_text || '—'}</p>
            </div>
          </div>

          {/* Transaction Chain Visualization */}
          <div className="cc-card-bg rounded-2xl border border-zinc-800/60 p-6 space-y-4">
            <h2 className="text-[10px] font-black text-orange-400 uppercase tracking-widest">
              Transaction Chain ({hops.length} hop{hops.length !== 1 ? 's' : ''})
            </h2>

            {hops.length === 0 ? (
              <p className="text-[10px] text-zinc-600 font-bold uppercase py-6 text-center">
                No transaction hops recorded
              </p>
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="flex items-start gap-0 min-w-max">
                  {/* Victim origin node */}
                  <div className="flex flex-col items-center mr-0">
                    <div className="w-3 h-3 rounded-full border-2 border-blue-500 bg-blue-900/30 z-10" />
                    <div className="mt-1 p-3 rounded-xl border border-blue-500/20 bg-blue-900/10 text-center min-w-[90px]">
                      <p className="text-[9px] font-black text-blue-400 uppercase">Victim</p>
                      <p className="text-[8px] text-zinc-500">{complaint?.victim_name?.split(' ')[0]}</p>
                    </div>
                  </div>

                  {hops.map((hop, i) => (
                    <React.Fragment key={i}>
                      {/* Arrow connector */}
                      <div className="flex items-start pt-1.5">
                        <div className="flex-1 flex items-center">
                          <div className="h-0.5 w-6" style={{ background: hop.is_mule_flagged ? '#ef4444' : '#f97316' }} />
                          <ArrowRight className="w-3 h-3 -ml-0.5" style={{ color: hop.is_mule_flagged ? '#ef4444' : '#f97316' }} />
                        </div>
                      </div>
                      <HopNode hop={hop} isFirst={i === 0} isLast={i === hops.length - 1} />
                    </React.Fragment>
                  ))}

                  {/* Last destination */}
                  <div className="flex items-start pt-1.5">
                    <div className="h-0.5 w-6 bg-zinc-700" />
                    <ArrowRight className="w-3 h-3 -ml-0.5 text-zinc-700" />
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full border-2 border-zinc-600 z-10" />
                    <div className="mt-1 p-3 rounded-xl border border-zinc-700/40 text-center min-w-[90px]">
                      <p className="text-[9px] font-black text-zinc-400 uppercase">Cash-Out?</p>
                      <p className="text-[8px] text-zinc-600">Predicted</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column: timeline + prediction summary */}
        <div className="space-y-6">
          {/* Status Timeline */}
          <div className="cc-card-bg rounded-2xl border border-zinc-800/60 p-6 space-y-4">
            <h2 className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Status Timeline</h2>
            <div className="space-y-0">
              {TIMELINE_STEPS.map((ts, i) => {
                const Icon = ts.icon;
                const done = i <= currentStatusIdx;
                const active = i === currentStatusIdx;
                const isLast = i === TIMELINE_STEPS.length - 1;
                return (
                  <div key={ts.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all
                        ${done ? 'border-orange-500 bg-orange-900/30'
                               : 'border-zinc-700 bg-transparent'}`}>
                        <Icon className={`w-3 h-3 ${done ? 'text-orange-400' : 'text-zinc-700'}`} />
                      </div>
                      {!isLast && (
                        <div className={`w-0.5 h-8 mt-1 ${done && i < currentStatusIdx ? 'bg-orange-500/40' : 'bg-zinc-800'}`} />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className={`text-[10px] font-black uppercase ${active ? 'text-orange-400' : done ? 'text-zinc-400' : 'text-zinc-700'}`}>
                        {ts.label}
                      </p>
                      {active && (
                        <p className="text-[8px] text-zinc-600 uppercase font-bold">Current status</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prediction summary card */}
          {prediction && (
            <div className="rounded-2xl border border-purple-500/20 p-5 space-y-4"
                 style={{ background: 'rgba(139,92,246,0.04)', backdropFilter: 'blur(12px)' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-black text-purple-400 uppercase tracking-widest">ML Prediction</h2>
                <Zap className="w-4 h-4 text-purple-400" />
              </div>
              <div className="space-y-2">
                <p className="text-[8px] font-black text-zinc-600 uppercase">Top Predicted Zone</p>
                <p className="text-sm font-black text-white">{prediction.predicted_zone_name}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase">Probability</span>
                  <span className="text-sm font-black text-orange-400">{(prediction.probability * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase">ETA</span>
                  <span className="text-[11px] font-black text-white">{prediction.eta_hours}h</span>
                </div>
                {/* Probability bar */}
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                       style={{ width: `${(prediction.probability * 100).toFixed(0)}%`,
                                background: 'linear-gradient(90deg, #f97316, #ef4444)' }} />
                </div>
              </div>
              <button onClick={() => navigate(`predictions/${prediction.id}`)}
                      className="w-full py-2 rounded-xl text-[9px] font-black uppercase transition-colors border border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                Full Prediction Report →
              </button>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};

export default ComplaintDetail;
