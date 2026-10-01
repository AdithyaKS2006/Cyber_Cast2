import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Clock, 
  Building2, 
  Send, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw,
  Zap,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useFreezeAlerts } from '../../hooks/useFreezeAlerts';
import apiClient from '../../utils/apiClient';

const FreezeQueue = () => {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pingingId, setPingingId] = useState(null);
  const [pingSuccess, setPingSuccess] = useState({});
  const [now, setNow] = useState(Date.now());

  const { alerts: wsAlerts, connectionStatus } = useFreezeAlerts();

  const fetchQueue = async () => {
    try {
      const response = await apiClient('/api/v2/freeze/queue/');
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const rawData = await response.json();
      const list = Array.isArray(rawData) ? rawData : (rawData?.results || []);
      setQueue(list);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch freeze queue:', err);
      setError('Unable to load interdiction queue telemetry');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchQueue();
  }, []);

  // Sync real-time WebSocket stream into local state
  useEffect(() => {
    if (wsAlerts && wsAlerts.length > 0) {
      setQueue((prevQueue) => {
        const mergedMap = new Map();
        // Insert existing queue items
        prevQueue.forEach((item) => mergedMap.set(item.id, item));
        // Overwrite / prepend with wsAlerts
        wsAlerts.forEach((item) => mergedMap.set(item.id, { ...mergedMap.get(item.id), ...item }));
        return Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.requested_at || 0) - new Date(a.requested_at || 0)
        );
      });
      setLoading(false);
    }
  }, [wsAlerts]);

  // 1s ticker for real-time countdown timer accuracy
  useEffect(() => {
    const ticker = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const handleManualPing = async (freezeId) => {
    setPingingId(freezeId);
    try {
      const response = await apiClient(`/api/v2/freeze/${freezeId}/manual-ping/`, {
        method: 'POST',
      });
      if (response.ok) {
        setPingSuccess(prev => ({ ...prev, [freezeId]: true }));
        setTimeout(() => {
          setPingSuccess(prev => ({ ...prev, [freezeId]: false }));
        }, 4000);
        fetchQueue();
      } else {
        alert('Failed to send manual ping to Nodal Officer');
      }
    } catch (err) {
      console.error('Manual ping failed:', err);
      alert('Network error while dispatching manual ping');
    } finally {
      setPingingId(null);
    }
  };

  const calculateRemainingSeconds = (expiresAtStr) => {
    if (!expiresAtStr) return 0;
    const expiresAt = new Date(expiresAtStr).getTime();
    const diff = Math.floor((expiresAt - now) / 1000);
    return diff > 0 ? diff : 0;
  };

  const formatCountdown = (seconds) => {
    if (seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatAmount = (amt) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amt);
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '--:--';
    const d = new Date(timeStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            PENDING
          </span>
        );
      case 'FROZEN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            FROZEN
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
            <XCircle className="w-3.5 h-3.5" />
            FAILED
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
            <Clock className="w-3.5 h-3.5" />
            EXPIRED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-700/50 text-zinc-300">
            {status}
          </span>
        );
    }
  };

  const renderWsBadge = () => {
    if (connectionStatus === 'CONNECTED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          WS LIVE
        </span>
      );
    }
    if (connectionStatus === 'CONNECTING') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
          WS CONNECTING
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium bg-zinc-700/40 text-zinc-400 border border-zinc-600/40">
        <WifiOff className="w-3 h-3 text-zinc-400" />
        WS OFF
      </span>
    );
  };

  return (
    <div className="glass-card rounded-xl p-5 border border-amber-500/20 bg-zinc-950/80 backdrop-blur-md shadow-2xl relative overflow-hidden my-6">
      {/* Background glow header effect */}
      <div className="absolute top-0 right-0 w-64 h-32 bg-amber-500/5 blur-3xl pointer-events-none" />

      {/* Card Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-amber-500/20 to-red-500/20 rounded-lg border border-amber-500/30 text-amber-400">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-100 tracking-wide flex items-center gap-2">
              Proactive Interdiction & Freeze Queue
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                1930 / I4C Live
              </span>
              {renderWsBadge()}
            </h2>
            <p className="text-xs text-zinc-400">
              Automated high-velocity account hold requests & Nodal Bank emergency dispatch
            </p>
          </div>
        </div>

        <button
          onClick={fetchQueue}
          disabled={loading}
          className="p-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-all flex items-center gap-1.5 text-xs font-medium"
          title="Refresh Queue"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Table Content */}
      {loading && queue.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm flex flex-col items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
          <span>Loading live interdiction queue...</span>
        </div>
      ) : error ? (
        <div className="py-8 text-center text-red-400 text-xs flex items-center justify-center gap-2 bg-red-500/10 rounded-lg border border-red-500/20">
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      ) : queue.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-lg">
          No pending freeze requests in queue
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800/80 text-zinc-400 font-semibold uppercase tracking-wider text-[11px] bg-zinc-900/40">
                <th className="py-3 px-3">Time</th>
                <th className="py-3 px-3">Amount</th>
                <th className="py-3 px-3">Target Account & Bank</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">ETA Window</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
              {queue.map((req) => {
                const secondsRemaining = calculateRemainingSeconds(req.window_expires_at);
                const isPending = req.status === 'PENDING';

                return (
                  <tr 
                    key={req.id} 
                    className="hover:bg-zinc-900/60 transition-colors group"
                  >
                    {/* Time */}
                    <td className="py-3 px-3 font-mono text-zinc-400 whitespace-nowrap">
                      {formatTime(req.requested_at)}
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-3 font-bold text-amber-400 whitespace-nowrap">
                      {formatAmount(req.freeze_amount)}
                    </td>

                    {/* Target Account & Bank */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                        <div>
                          <span className="font-mono text-zinc-200 font-semibold block">
                            {req.target_account}
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            {req.target_bank_name || req.target_bank_ifsc} ({req.target_bank_ifsc})
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {renderStatusBadge(req.status)}
                    </td>

                    {/* Countdown / ETA Window */}
                    <td className="py-3 px-3 whitespace-nowrap font-mono">
                      {isPending ? (
                        <div className="flex items-center gap-1.5 text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 w-fit">
                          <Clock className="w-3.5 h-3.5 animate-pulse" />
                          <span>{formatCountdown(secondsRemaining)}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-500 text-[11px]">
                          {req.cash_out_eta_minutes || 15}m standard window
                        </span>
                      )}
                    </td>

                    {/* Action Button */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {req.status === 'FAILED' ? (
                        <button
                          onClick={() => handleManualPing(req.id)}
                          disabled={pingingId === req.id}
                          className="px-3 py-1.5 rounded-md bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-semibold text-xs transition-all shadow-md hover:shadow-red-500/20 active:scale-95 flex items-center gap-1.5 ml-auto"
                        >
                          <Send className={`w-3.5 h-3.5 ${pingingId === req.id ? 'animate-bounce' : ''}`} />
                          <span>{pingingId === req.id ? 'Dispatching...' : 'Manual Ping'}</span>
                        </button>
                      ) : pingSuccess[req.id] ? (
                        <span className="text-emerald-400 font-semibold text-xs inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Pinged
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-[11px] font-mono">
                          {req.i4c_freeze_id || 'AUTO_PROCESSED'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FreezeQueue;
