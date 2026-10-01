import React, { useState, useEffect } from 'react';
import { ChevronRight, Bell, Zap, CheckCircle, Clock, AlertTriangle, X } from 'lucide-react';
import apiClient from '../../utils/apiClient';

const STATUS_STYLES = {
  SENT:         { bg: 'bg-orange-900/20', text: 'text-orange-400',  border: 'border-orange-500/30', label: 'Alert Sent'    },
  ACKNOWLEDGED: { bg: 'bg-blue-900/20',   text: 'text-blue-400',    border: 'border-blue-500/30',   label: 'Acknowledged'  },
  DISPATCHED:   { bg: 'bg-green-900/20',  text: 'text-green-400',   border: 'border-green-500/30',  label: 'Dispatched'    },
  EXPIRED:      { bg: 'bg-zinc-800/30',   text: 'text-zinc-500',    border: 'border-zinc-700/30',   label: 'Expired'       },
};

// Bands relative to the 40-class random baseline (2.5%); ~0.26 is a strong signal.
const PROB_COLOR = (p) => p >= 0.20 ? 'text-red-400' : p >= 0.10 ? 'text-orange-400' : 'text-yellow-400';

const PredictionAlertCard = ({ alert, onAcknowledge, onDismiss }) => {
  const s = STATUS_STYLES[alert.status] || STATUS_STYLES.SENT;
  return (
    <div
      className={`p-4 rounded-xl border ${s.border} ${s.bg} space-y-3 group transition-all hover:border-orange-500/50`}
    >
      {/* Header */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
          <span className="text-[9px] font-black text-zinc-300 uppercase tracking-wide truncate">
            {alert.zone_name}
          </span>
        </div>
        <button
          onClick={() => onDismiss(alert.id)}
          className="text-zinc-700 hover:text-white transition-colors flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Probability + ETA */}
      <div className="flex justify-between items-center">
        <span className={`text-lg font-black ${PROB_COLOR(alert.probability)}`}>
          {(alert.probability * 100).toFixed(0)}%
        </span>
        <div className="flex items-center gap-1 text-zinc-500">
          <Clock className="w-3 h-3" />
          <span className="text-[9px] font-bold uppercase">ETA {alert.eta_hours}h</span>
        </div>
      </div>

      {/* Complaint ref */}
      <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-tight">
        Complaint: {alert.complaint_number || 'N/A'}
      </p>

      {/* Status badge */}
      <div className="flex items-center justify-between">
        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${s.border} ${s.text}`}>
          {s.label}
        </span>
        {alert.status === 'SENT' && (
          <button
            onClick={() => onAcknowledge(alert.id)}
            className="text-[8px] font-black uppercase py-1 px-2 rounded bg-orange-600 text-black hover:bg-orange-500 transition-colors"
          >
            Acknowledge
          </button>
        )}
        {alert.status === 'ACKNOWLEDGED' && (
          <div className="flex items-center gap-1 text-green-400">
            <CheckCircle className="w-3 h-3" />
            <span className="text-[8px] font-black uppercase">Dispatched</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
const TriageSidebar = ({ isOpen, onClose, onOpen, navigate }) => {
  // Starts empty — populated from the real alerts API on mount and appended
  // to by the live WebSocket stream. No seeded mock alerts.
  const [alerts, setAlerts] = useState([]);

  // Load real alerts once on mount (apiClient returns a raw Response).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient('/api/v1/predictions/alerts/?limit=10');
        if (!res.ok) return;
        const data = await res.json();
        const list = data?.results ?? data ?? [];
        if (!cancelled && Array.isArray(list)) {
          // The serializer exposes `predicted_zone_name`; this card reads `zone_name`.
          setAlerts(list.map(a => ({ ...a, zone_name: a.predicted_zone_name ?? a.zone_name })));
        }
      } catch { /* honest empty state on failure */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // WebSocket connection for real-time prediction alerts
  useEffect(() => {
    const isStaticHost = typeof window !== 'undefined' && 
      (window.location.hostname.includes('github.io') || window.location.hostname.includes('pages.dev'));
    if (isStaticHost && !import.meta.env.VITE_WS_HOST) {
      return;
    }

    const match = document.cookie.match(new RegExp('(^| )ws_token=([^;]+)')) || document.cookie.match(new RegExp('(^| )access_token=([^;]+)'));
    const token = match ? match[2] : (localStorage.getItem('access_token') || '');
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = import.meta.env.VITE_WS_HOST || window.location.host;
    const wsUrl = token ? `${protocol}://${host}/ws/predictions/?token=${token}` : `${protocol}://${host}/ws/predictions/`;

    let ws;
    try {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'prediction') {
            setAlerts(prev => [{
              id: `ws_${Date.now()}`,
              zone_name: data.zone,
              probability: data.probability,
              eta_hours: data.eta,
              complaint_number: data.complaint_id,
              status: 'SENT',
            }, ...prev].slice(0, 10));
          } else if (data.type === 'alert_acknowledge') {
            setAlerts(prev => prev.map(a =>
              a.complaint_number === data.complaint_id
                ? { ...a, status: 'ACKNOWLEDGED' } : a
            ));
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (ws) {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close();
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
    };
  }, []);

  const handleAcknowledge = (id) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'ACKNOWLEDGED' } : a));
  };

  const handleDismiss = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  // ── Collapsed view ───────────────────────────────────────────
  if (!isOpen) return (
    <div className="w-12 flex flex-col items-center pt-4 bg-zinc-950 border-l border-orange-900/20">
      <button
        onClick={onOpen}
        className="p-2 text-orange-500 hover:bg-orange-500/10 rounded-lg transition-all relative"
      >
        <ChevronRight className="w-5 h-5 rotate-180" />
        {alerts.some(a => a.status === 'SENT') && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </button>
      <div className="mt-8 [writing-mode:vertical-lr] text-[10px] font-black text-orange-900 uppercase tracking-[0.4em]">
        Alert Center
      </div>
    </div>
  );

  // ── Expanded view ────────────────────────────────────────────
  const activeCount = alerts.filter(a => a.status === 'SENT').length;

  return (
    <div
      className="fixed md:relative right-0 top-16 md:top-0 bottom-0 z-40 bg-black/95 md:bg-transparent w-72 flex-shrink-0 flex flex-col h-[calc(100vh-4rem)] md:h-auto overflow-y-auto custom-scrollbar"
      style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.92), rgba(5,5,5,0.97))',
        borderLeft: '1px solid rgba(249,115,22,0.12)',
      }}
    >
      {/* Header */}
      <div
        className="p-4 flex justify-between items-center sticky top-0 z-10"
        style={{ borderBottom: '1px solid rgba(249,115,22,0.10)', background: 'rgba(0,0,0,0.95)' }}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bell className="w-4 h-4 text-orange-400" />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 flex items-center justify-center text-[6px] font-black text-white">
                {activeCount}
              </span>
            )}
          </div>
          <h3 className="text-xs font-black uppercase tracking-widest"
              style={{ background: 'linear-gradient(90deg, #f97316, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Alert Center
          </h3>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-white transition-all">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Live indicator */}
      <div className="px-4 py-2 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">
          Live Prediction Stream
        </span>
      </div>

      {/* Alert cards */}
      <div className="p-4 space-y-3 flex-1">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Zap className="w-8 h-8 text-zinc-800" />
            <p className="text-[10px] text-zinc-700 font-bold uppercase">No active alerts</p>
          </div>
        ) : (
          alerts.map(a => (
            <PredictionAlertCard
              key={a.id}
              alert={a}
              onAcknowledge={handleAcknowledge}
              onDismiss={handleDismiss}
            />
          ))
        )}
      </div>

      {/* Footer: quick-nav to Predictions */}
      <div className="p-4" style={{ borderTop: '1px solid rgba(249,115,22,0.08)' }}>
        <button
          onClick={() => navigate('predictions')}
          className="w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
          style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)', color: 'black' }}
        >
          View All Predictions →
        </button>
      </div>
    </div>
  );
};

export default TriageSidebar;
