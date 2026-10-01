/**
 * LEADispatchQueue.jsx - Field Officer LEA Dispatch View (F9)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair, CheckCircle, Clock, Shield, RefreshCw, AlertTriangle } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import PageTransition from '../ui/PageTransition';
import useTheme from '../../hooks/useTheme';

const STATUS = {
  SENT:         { label: 'Pending Action', bg: 'rgba(249,115,22,0.12)', color: '#ea580c', border: 'rgba(249,115,22,0.35)' },
  ACKNOWLEDGED: { label: 'Acknowledged',   bg: 'rgba(59,130,246,0.12)',  color: '#2563eb', border: 'rgba(59,130,246,0.35)' },
  RESOLVED:     { label: 'Resolved',       bg: 'rgba(16,185,129,0.12)',  color: '#10b981', border: 'rgba(16,185,129,0.35)' },
};

const DispatchCard = ({ dispatch, onAck, onOutcome, idx, isLight }) => {
  const s = STATUS[dispatch.status] || STATUS.SENT;
  const canAct = dispatch.status === 'SENT';
  const canResolve = dispatch.status === 'ACKNOWLEDGED';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ delay: idx * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="p-4 rounded-2xl border space-y-3 transition-colors relative overflow-hidden"
      style={{
        background: isLight ? 'rgba(255,255,255,0.98)' : 'rgba(0,0,0,0.65)',
        borderColor: isLight ? 'rgba(226,232,240,0.95)' : 'rgba(39,39,42,0.6)',
        boxShadow: isLight ? '0 4px 20px rgba(99,102,241,0.06)' : 'none',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-[9px] font-black uppercase tracking-wide ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
            {typeof dispatch.complaint_number === 'object' ? JSON.stringify(dispatch.complaint_number) : String(dispatch.complaint_number ?? `PKG-${typeof dispatch.package === 'object' ? JSON.stringify(dispatch.package) : (dispatch.package ?? '')}`)}
          </p>
          <p className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            ₹{Number(dispatch.fraud_amount ?? 0).toLocaleString('en-IN')}
          </p>
        </div>
        <span
          className="text-[7px] font-black uppercase rounded px-2 py-0.5 flex-shrink-0 mt-0.5"
          style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
        >
          {s.label}
        </span>
      </div>

      <div className="flex justify-between items-end">
        <div>
          <p className={`text-[8px] font-bold uppercase mb-0.5 ${isLight ? 'text-slate-500' : 'text-zinc-600'}`}>Target District</p>
          <p className={`text-[11px] font-black leading-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {typeof dispatch.target_district === 'object' && dispatch.target_district !== null ? (dispatch.target_district.name || JSON.stringify(dispatch.target_district)) : String(dispatch.target_district ?? '—')}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-[8px] font-bold uppercase mb-0.5 ${isLight ? 'text-slate-500' : 'text-zinc-600'}`}>Predicted Zone</p>
          <p className={`text-[11px] font-black leading-none ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
            {typeof dispatch.predicted_zone_name === 'object' && dispatch.predicted_zone_name !== null ? (dispatch.predicted_zone_name.name || JSON.stringify(dispatch.predicted_zone_name)) : String(dispatch.predicted_zone_name ?? '—')}
          </p>
        </div>
      </div>

      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isLight ? 'bg-slate-100' : 'bg-zinc-900/50'}`}>
        <Clock className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
        <span className={`text-[10px] font-black uppercase ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
          Dispatched: {new Date(dispatch.sent_at).toLocaleString('en-IN')}
        </span>
      </div>

      {canAct ? (
        <button
          onClick={() => onAck(dispatch)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px]
                     font-black uppercase text-white transition-all hover:scale-[1.02] active:scale-95 touch-feedback shadow-sm"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          <CheckCircle className="w-4 h-4" /> Acknowledge Dispatch
        </button>
      ) : canResolve ? (
        <div className="space-y-2">
          <div className={`text-[9px] font-bold uppercase text-center ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Log Field Outcome</div>
          <div className="flex gap-2">
            <button
              onClick={() => onOutcome(dispatch, 'INTERCEPTED')}
              className={`flex-1 py-2 rounded-xl text-[8px] font-black uppercase transition-all ${
                isLight
                  ? 'text-emerald-700 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100'
                  : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20'
              }`}
            >
              Intercepted
            </button>
            <button
              onClick={() => onOutcome(dispatch, 'MISSED')}
              className={`flex-1 py-2 rounded-xl text-[8px] font-black uppercase transition-all ${
                isLight
                  ? 'text-red-700 bg-red-50 border border-red-300 hover:bg-red-100'
                  : 'text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20'
              }`}
            >
              Missed
            </button>
            <button
              onClick={() => onOutcome(dispatch, 'FALSE_ALARM')}
              className={`flex-1 py-2 rounded-xl text-[8px] font-black uppercase transition-all ${
                isLight
                  ? 'text-slate-600 bg-slate-100 border border-slate-300 hover:bg-slate-200'
                  : 'text-zinc-400 bg-zinc-800/40 border border-zinc-700/50 hover:bg-zinc-800/70'
              }`}
            >
              False Alarm
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-emerald-500">
          <CheckCircle className="w-4 h-4" />
          <span className="text-[9px] font-black uppercase">
            Resolved: {dispatch.outcome_recorded || 'COMPLETE'}
          </span>
        </div>
      )}
    </motion.div>
  );
};

const LEADispatchQueue = () => {
  const isLight = useTheme();
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [filter, setFilter]         = useState('ALL');

  const fetchDispatches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient('/api/v1/predictions/dispatches/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.results ?? data.dispatches ?? []);
      setDispatches(list);
    } catch (err) {
      const msg = typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err);
      setError(msg || 'Failed to load dispatches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDispatches();
  }, [fetchDispatches]);

  // WebSocket Live Updates for dispatches
  useEffect(() => {
    const isStaticHost = typeof window !== 'undefined' && 
      (window.location.hostname.includes('github.io') || window.location.hostname.includes('pages.dev'));
    if (isStaticHost && !import.meta.env.VITE_WS_HOST) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host  = import.meta.env.VITE_WS_HOST || window.location.host;
    const wsUrl = `${proto}//${host}/ws/dispatches/`;

    let ws;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'dispatch.new' && payload.data) {
            setDispatches(prev => {
              const exists = prev.some(d => d.id === payload.data.id);
              if (exists) return prev;
              return [payload.data, ...prev];
            });
          } else if (payload.type === 'dispatch.update' && payload.data) {
            setDispatches(prev => prev.map(d => d.id === payload.data.id ? { ...d, ...payload.data } : d));
          }
        } catch {}
      };
      ws.onerror = () => {};
    } catch {}

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const handleAck = useCallback(async (dispatch) => {
    try {
      const res = await apiClient(`/api/v1/predictions/dispatches/${dispatch.id}/ack/`, { method: 'POST' });
      if (res.ok) {
        setDispatches(prev => prev.map(d => d.id === dispatch.id ? { ...d, status: 'ACKNOWLEDGED' } : d));
      }
    } catch {}
  }, []);

  const handleOutcome = useCallback(async (dispatch, outcome) => {
    try {
      const res = await apiClient(`/api/v1/predictions/dispatches/${dispatch.id}/outcome/`, {
        method: 'POST',
        body: JSON.stringify({ outcome })
      });
      if (res.ok) {
        setDispatches(prev => prev.map(d => d.id === dispatch.id ? { ...d, status: 'RESOLVED', outcome_recorded: outcome } : d));
      }
    } catch {}
  }, []);

  const displayed = dispatches.filter(d => {
    if (filter === 'ALL') return d.status !== 'RESOLVED';
    return d.status === filter;
  });
  
  const sentCount = dispatches.filter(d => d.status === 'SENT').length;

  return (
    <PageTransition>
      <div
        className="min-h-screen p-4 sm:p-6 space-y-4 sm:space-y-6"
        style={{ background: isLight ? 'transparent' : 'linear-gradient(135deg,#000,#080808)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Crosshair className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />
              {sentCount > 0 && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500
                             flex items-center justify-center text-[8px] font-black text-white"
                >
                  {sentCount}
                </motion.span>
              )}
            </div>
            <div>
              <h1 className={`text-xl sm:text-2xl font-black uppercase tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Incoming Dispatches
              </h1>
              <p className={`text-[9px] font-bold uppercase ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                LEA Operations Queue · {displayed.length} shown
              </p>
            </div>
          </div>

          <button onClick={fetchDispatches} disabled={loading}
            className={`p-2.5 rounded-xl border transition-all active:scale-95 ${
              isLight
                ? 'bg-white border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-300 shadow-sm'
                : 'border-zinc-800 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30'
            }`}
            style={isLight ? {} : { background: 'rgba(0,0,0,0.6)' }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs border ${
              isLight ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-yellow-500/10 border-yellow-500/20 text-amber-400'
            }`}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Could not load dispatches. {typeof error === 'object' ? JSON.stringify(error) : String(error)}</span>
          </motion.div>
        )}

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {['ALL', 'SENT', 'ACKNOWLEDGED', 'RESOLVED'].map(tab => (
            <button
              key={tab} onClick={() => setFilter(tab)}
              className="flex-shrink-0 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all touch-feedback"
              style={filter === tab
                ? { background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', boxShadow: '0 4px 12px rgba(16,185,129,0.25)' }
                : {
                    background: isLight ? '#ffffff' : 'rgba(0,0,0,0.5)',
                    border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(39,39,42,0.8)',
                    color: isLight ? '#64748b' : '#71717a',
                    boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.04)' : 'none'
                  }
              }
            >
              {tab === 'ALL' ? 'ACTIVE' : tab}
              {tab === 'SENT' && sentCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[7px]">{sentCount}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, i) => <Skeleton.AlertCard key={i} />)}
          </div>
        ) : displayed.length === 0 ? (
          <EmptyState
            icon={Shield}
            title={filter === 'ALL' ? 'No Active Dispatches' : `No ${filter.toLowerCase()} dispatches`}
            message="No law enforcement dispatches found for this filter criteria."
            action={filter !== 'ALL' ? { label: 'View Active', onClick: () => setFilter('ALL') } : null}
          />
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayed.map((d, i) => (
                <DispatchCard
                  key={d.id}
                  dispatch={d}
                  idx={i}
                  onAck={handleAck}
                  onOutcome={handleOutcome}
                  isLight={isLight}
                />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </PageTransition>
  );
};

export default LEADispatchQueue;
