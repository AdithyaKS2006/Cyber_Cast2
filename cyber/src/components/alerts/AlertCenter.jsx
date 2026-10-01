/**
 * AlertCenter.jsx — CrimeCast Real-Time Alert Center
 * WebSocket feed · Countdown timers · Skeleton loading · Empty state · Framer Motion · Light/Dark Theme
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, BellOff, CheckCircle, Truck, XCircle,
  Clock, AlertTriangle, Zap, Volume2, VolumeX, RefreshCw, Shield,
} from 'lucide-react';
import apiClient from '../../utils/apiClient';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import PageTransition from '../ui/PageTransition';
import useTheme from '../../hooks/useTheme';

/* ── Countdown hook ────────────────────────────────────────────────── */
const useCountdown = (etaHours) => {
  const totalSecs = Math.max(0, Math.round((etaHours ?? 0) * 3600));
  const [secs, setSecs] = useState(totalSecs);

  useEffect(() => {
    setSecs(Math.max(0, Math.round((etaHours ?? 0) * 3600)));
  }, [etaHours]);

  useEffect(() => {
    if (secs <= 0) return;
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secs]);

  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const str = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return { str, expired: secs === 0, critical: secs < 3600 && secs > 0 };
};

/* ── Status config ─────────────────────────────────────────────────── */
const STATUS = {
  SENT:         { label: 'Alert Sent',   bg: 'rgba(249,115,22,0.12)', color: '#ea580c', border: 'rgba(249,115,22,0.35)' },
  ACKNOWLEDGED: { label: 'Acknowledged', bg: 'rgba(59,130,246,0.12)',  color: '#2563eb', border: 'rgba(59,130,246,0.35)' },
  DISPATCHED:   { label: 'Dispatched',   bg: 'rgba(34,197,94,0.12)',   color: '#16a34a', border: 'rgba(34,197,94,0.35)'  },
  FALSE_ALARM:  { label: 'False Alarm',  bg: 'rgba(100,116,139,0.12)', color: '#64748b', border: 'rgba(100,116,139,0.3)' },
  EXPIRED:      { label: 'Expired',      bg: 'rgba(148,163,184,0.15)', color: '#475569', border: 'rgba(148,163,184,0.3)' },
};

const probColor = (p) => p >= 0.20 ? '#ef4444' : p >= 0.10 ? '#f97316' : '#eab308';

/* ── Single alert card ─────────────────────────────────────────────── */
const AlertCard = ({ alert, onAck, onDispatch, onFalse, idx, isLight }) => {
  const { str, expired, critical } = useCountdown(alert.eta_hours);
  const prob  = alert.probability ?? 0;
  const color = probColor(prob);
  const s     = STATUS[alert.status] ?? STATUS.SENT;
  const canAct   = alert.status === 'SENT';
  const isUrgent = prob >= 0.20 && critical;
  const [showXml, setShowXml] = useState(false);
  const xmlPayload = alert.iso20022_xml || alert.iso20022_payload || null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ delay: idx * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`p-4 rounded-2xl border space-y-3 transition-all relative overflow-hidden ${
        isUrgent ? 'alert-critical-border' : ''
      }`}
      style={{
        background: isUrgent
          ? (isLight ? 'rgba(254,242,242,0.98)' : 'rgba(239,68,68,0.05)')
          : (isLight ? 'rgba(255,255,255,0.98)' : 'rgba(0,0,0,0.65)'),
        borderColor: isUrgent
          ? 'rgba(239,68,68,0.4)'
          : (isLight ? 'rgba(226,232,240,0.95)' : 'rgba(39,39,42,0.6)'),
        boxShadow: isLight ? '0 4px 20px rgba(99,102,241,0.06)' : 'none',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* URGENT pulse dot */}
      {isUrgent && (
        <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-red-500 alert-urgent" />
      )}

      {/* Row 1: Complaint # + status */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-[9px] font-black uppercase tracking-wide ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>
            {typeof alert.complaint_number === 'object' ? JSON.stringify(alert.complaint_number) : String(alert.complaint_number ?? `ALT-${typeof alert.id === 'object' ? JSON.stringify(alert.id) : alert.id}`)}
          </p>
          <p className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            ₹{Number(alert.fraud_amount ?? 0).toLocaleString('en-IN')}
          </p>
        </div>
        <span
          className="text-[7px] font-black uppercase rounded px-2 py-0.5 flex-shrink-0 mt-0.5"
          style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
        >
          {s.label}
        </span>
      </div>

      {/* Row 2: Zone + Probability */}
      <div className="flex justify-between items-end">
        <div>
          <p className={`text-[8px] font-bold uppercase mb-0.5 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Predicted Zone</p>
          <p className={`text-[11px] font-black leading-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {typeof alert.predicted_zone_name === 'object' && alert.predicted_zone_name !== null ? (alert.predicted_zone_name.name || JSON.stringify(alert.predicted_zone_name)) : String(alert.predicted_zone_name ?? '—')}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-[8px] font-bold uppercase mb-0.5 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>Likelihood</p>
          <p className="text-2xl font-black leading-none" style={{ color }}>
            {(prob * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Probability bar */}
      <div className={`h-1.5 rounded-full overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-zinc-800/80'}`}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(prob * 100).toFixed(0)}%` }}
          transition={{ delay: idx * 0.04 + 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ background: `linear-gradient(90deg, ${color}, #ef4444)` }}
        />
      </div>

      {/* ETA countdown */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl"
        style={{
          background: expired
            ? (isLight ? '#f1f5f9' : 'rgba(39,39,42,0.5)')
            : critical
              ? (isLight ? '#fee2e2' : 'rgba(239,68,68,0.1)')
              : (isLight ? '#fff7ed' : 'rgba(249,115,22,0.07)'),
        }}
      >
        <Clock
          className={`w-3.5 h-3.5 flex-shrink-0 ${
            expired
              ? (isLight ? 'text-slate-400' : 'text-zinc-600')
              : critical
                ? 'text-red-500'
                : (isLight ? 'text-orange-500' : 'text-orange-400')
          }`}
        />
        <span
          className={`text-[10px] font-black uppercase ${
            expired
              ? (isLight ? 'text-slate-500' : 'text-zinc-500')
              : critical
                ? 'text-red-600'
                : (isLight ? 'text-orange-800' : 'text-orange-300')
          }`}
        >
          {expired ? 'ETA Expired' : `Cash-Out in ${str}`}
        </span>
        {critical && !expired && (
          <span
            className="ml-auto text-[7px] font-black uppercase px-1.5 py-0.5 rounded"
            style={{
              background: isLight ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.2)',
              color: isLight ? '#dc2626' : '#f87171',
              border: '1px solid rgba(239,68,68,0.35)',
            }}
          >
            URGENT
          </span>
        )}
      </div>

      {/* Action buttons */}
      {canAct && (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onAck(alert)}
            className="flex items-center justify-center gap-1 py-2.5 rounded-xl text-[8px]
                       font-black uppercase transition-all hover:scale-[1.02] active:scale-95 touch-feedback"
            style={{
              background: isLight ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.15)',
              border: isLight ? '1px solid rgba(59,130,246,0.25)' : '1px solid rgba(59,130,246,0.3)',
              color: isLight ? '#2563eb' : '#60a5fa',
            }}
          >
            <CheckCircle className="w-3 h-3" /> Ack
          </button>
          <button
            onClick={() => onDispatch(alert)}
            className="flex items-center justify-center gap-1 py-2.5 rounded-xl text-[8px]
                       font-black uppercase text-white transition-all hover:scale-[1.02] active:scale-95 touch-feedback shadow-sm"
            style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }}
          >
            <Truck className="w-3 h-3" /> Dispatch
          </button>
          <button
            onClick={() => onFalse(alert)}
            className="flex items-center justify-center gap-1 py-2.5 rounded-xl text-[8px]
                       font-black uppercase transition-all hover:scale-[1.02] active:scale-95 touch-feedback"
            style={{
              background: isLight ? '#f1f5f9' : 'rgba(39,39,42,0.6)',
              border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(63,63,70,0.5)',
              color: isLight ? '#64748b' : '#71717a',
            }}
          >
            <XCircle className="w-3 h-3" /> False
          </button>
        </div>
      )}

      {xmlPayload && (
        <div className="mt-2">
          <button
            onClick={() => setShowXml(!showXml)}
            className={`w-full text-left text-[9px] font-black uppercase transition-colors flex justify-between items-center ${
              isLight ? 'text-slate-500 hover:text-orange-600' : 'text-zinc-500 hover:text-orange-400'
            }`}
          >
            <span>ISO 20022 camt.056 CBS Payload</span>
            <span>{showXml ? 'Hide' : 'View'}</span>
          </button>
          <AnimatePresence>
            {showXml && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 overflow-hidden"
              >
                <div className={`p-3 rounded-lg overflow-x-auto text-[8px] font-mono max-h-40 overflow-y-auto custom-scrollbar border ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-black/80 border-zinc-800 text-zinc-400'
                }`}>
                  <pre>{xmlPayload}</pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {alert.status === 'DISPATCHED' && (
        <div className={`flex items-center gap-2 ${isLight ? 'text-emerald-600' : 'text-green-400'}`}>
          <CheckCircle className="w-4 h-4" />
          <span className="text-[9px] font-black uppercase font-bold">Team Dispatched</span>
        </div>
      )}
    </motion.div>
  );
};

/* ══ Main Component ═════════════════════════════════════════════════ */
const AlertCenter = ({ navigate }) => {
  const isLight = useTheme();
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [sound, setSound]     = useState(true);
  const [filter, setFilter]   = useState('ALL');
  const wsRef   = useRef(null);
  const audioCtx = useRef(null);

  /* ─ Beep ─ */
  const playBeep = useCallback(() => {
    if (!sound) return;
    try {
      if (!audioCtx.current)
        audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(); osc.stop(ctx.currentTime + 0.35);
    } catch {}
  }, [sound]);

  /* ─ Fetch ─ (apiClient returns a raw Response; parse it, never fake it) */
  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient('/api/v1/predictions/alerts/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.results ?? data.alerts ?? []);
      setAlerts(list);
    } catch (err) {
      const msg = typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err);
      setError(msg || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  /* ─ WebSocket live updates ─ */
  useEffect(() => {
    const isStaticHost = typeof window !== 'undefined' && 
      (window.location.hostname.includes('github.io') || window.location.hostname.includes('pages.dev'));
    if (isStaticHost && !import.meta.env.VITE_WS_HOST) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host  = import.meta.env.VITE_WS_HOST || window.location.host;
    const wsUrl = `${proto}//${host}/ws/alerts/`;

    let ws;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'alert.new' && payload.data) {
            setAlerts(prev => {
              const exists = prev.some(a => a.id === payload.data.id);
              if (exists) return prev;
              playBeep();
              return [payload.data, ...prev];
            });
          } else if (payload.type === 'alert.update' && payload.data) {
            setAlerts(prev => prev.map(a => a.id === payload.data.id ? { ...a, ...payload.data } : a));
          }
        } catch {}
      };

      ws.onerror = () => {};
    } catch {}

    return () => {
      if (ws) ws.close();
    };
  }, [playBeep]);

  /* ─ Actions ─ */
  const handleAck = useCallback(async (alert) => {
    try {
      const res = await apiClient(`/api/v1/predictions/alerts/${alert.id}/ack/`, { method: 'POST' });
      if (res.ok) {
        setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, status: 'ACKNOWLEDGED' } : a));
      }
    } catch {}
  }, []);

  const handleDispatch = useCallback(async (alert) => {
    try {
      const res = await apiClient(`/api/v1/predictions/alerts/${alert.id}/dispatch/`, { method: 'POST' });
      if (res.ok) {
        setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, status: 'DISPATCHED' } : a));
      }
    } catch {}
  }, []);

  const handleFalse = useCallback(async (alert) => {
    try {
      const res = await apiClient(`/api/v1/predictions/alerts/${alert.id}/false-alarm/`, { method: 'POST' });
      if (res.ok) {
        setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, status: 'FALSE_ALARM' } : a));
      }
    } catch {}
  }, []);

  /* ─ Filtering ─ */
  const FILTER_TABS = ['ALL', 'SENT', 'ACKNOWLEDGED', 'DISPATCHED'];

  const displayed = alerts
    .filter(a => filter === 'ALL' ? true : a.status === filter)
    .sort((a, b) => (b.probability - b.eta_hours / 100) - (a.probability - a.eta_hours / 100));

  const sentCount = alerts.filter(a => a.status === 'SENT').length;

  return (
    <PageTransition>
      <div
        className="min-h-screen p-4 sm:p-6 space-y-4 sm:space-y-6"
        style={{ background: isLight ? 'transparent' : 'linear-gradient(135deg,#000,#080808)' }}
      >

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500" />
              {sentCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500
                             flex items-center justify-center text-[8px] font-black text-white"
                >
                  {sentCount}
                </motion.span>
              )}
            </div>
            <div>
              <h1 className={`text-xl sm:text-2xl font-black uppercase tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Alert Center
              </h1>
              <p className={`text-[9px] font-bold uppercase ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                Real-time prediction alerts · {displayed.length} shown
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSound(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border
                          text-[9px] font-black uppercase transition-all ${
                            sound
                              ? (isLight ? 'text-orange-700 border-orange-200' : 'text-orange-400')
                              : (isLight ? 'border-slate-200 text-slate-500' : 'border-zinc-700 text-zinc-600')
                          }`}
              style={sound ? { background: 'rgba(249,115,22,0.1)', border: isLight ? '1px solid rgba(249,115,22,0.3)' : '1px solid rgba(249,115,22,0.3)' } : { background: isLight ? '#ffffff' : 'transparent' }}
            >
              {sound ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{sound ? 'Sound On' : 'Muted'}</span>
            </button>
            <button
              onClick={fetchAlerts}
              disabled={loading}
              className={`p-2.5 rounded-xl border transition-all active:scale-95 ${
                isLight
                  ? 'bg-white border-slate-200 text-slate-600 hover:text-orange-600 hover:border-orange-200 shadow-sm'
                  : 'border-zinc-800 text-zinc-500 hover:text-orange-400 hover:border-orange-500/30'
              }`}
              style={isLight ? {} : { background: 'rgba(0,0,0,0.6)' }}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-slate-500' : 'text-zinc-600'}`}>
            Live WebSocket Stream · {alerts.length} total
          </span>
        </div>

        {/* Error banner */}
        {error && !loading && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs border ${
              isLight
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-yellow-500/10 border-yellow-500/20 text-amber-400'
            }`}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Could not load alerts. {typeof error === 'object' ? JSON.stringify(error) : String(error)}</span>
          </motion.div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className="flex-shrink-0 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all touch-feedback"
              style={filter === tab
                ? { background: 'linear-gradient(135deg,#f97316,#ef4444)', color: '#fff', boxShadow: '0 4px 12px rgba(249,115,22,0.25)' }
                : {
                    background: isLight ? '#ffffff' : 'rgba(0,0,0,0.5)',
                    border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(39,39,42,0.8)',
                    color: isLight ? '#64748b' : '#71717a',
                    boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.04)' : 'none'
                  }
              }
            >
              {tab}
              {tab === 'SENT' && sentCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[7px]">
                  {sentCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Alert grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, i) => <Skeleton.AlertCard key={i} />)}
          </div>
        ) : displayed.length === 0 ? (
          <EmptyState
            icon={filter === 'ALL' ? BellOff : Shield}
            title={filter === 'ALL' ? 'All Clear' : `No ${filter.toLowerCase()} alerts`}
            message={
              filter === 'ALL'
                ? 'No active alerts. The system will notify you when new predictions are generated.'
                : `No alerts with status "${filter}" right now.`
            }
            action={filter !== 'ALL' ? { label: 'View All', onClick: () => setFilter('ALL') } : null}
          />
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayed.map((a, i) => (
                <AlertCard
                  key={a.id}
                  alert={a}
                  idx={i}
                  onAck={handleAck}
                  onDispatch={handleDispatch}
                  onFalse={handleFalse}
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

export default AlertCenter;
