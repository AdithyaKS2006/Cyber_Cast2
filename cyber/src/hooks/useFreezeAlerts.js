import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom React hook for real-time proactive freeze queue & interdiction alerts.
 * Connects to WebSocket endpoint: ws://localhost:8000/ws/freeze-ops/
 * Returns: { alerts, latestFreeze, connectionStatus }
 */
export function useFreezeAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [latestFreeze, setLatestFreeze] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED'); // CONNECTING, CONNECTED, DISCONNECTED, ERROR
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const connectWebSocket = useCallback(() => {
    // On static hosting (like GitHub Pages) without an explicit VITE_WS_HOST, do not attempt to open WebSockets to static host
    const isStaticHost = typeof window !== 'undefined' && 
      (window.location.hostname.includes('github.io') || window.location.hostname.includes('pages.dev'));
    if (isStaticHost && !import.meta.env.VITE_WS_HOST) {
      setConnectionStatus('CONNECTED');
      return;
    }

    // Construct WebSocket URL dynamically or fallback to localhost:8000
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const defaultHost = (window.location.port === '3000' || window.location.port === '5173')
      ? `${window.location.hostname}:8000`
      : window.location.host;
    const host = import.meta.env.VITE_WS_HOST || defaultHost;
    
    // Obtain auth token if stored
    const token = localStorage.getItem('token') || localStorage.getItem('access_token') || '';
    const wsUrl = `${protocol}//${host}/ws/freeze-ops/${token ? `?token=${token}` : ''}`;

    setConnectionStatus('CONNECTING');

    try {
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setConnectionStatus('CONNECTED');
        console.log('[FreezeOps WS] Connected successfully to freeze-ops channel');
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { type, data } = payload;

          if (type === 'freeze_init') {
            if (Array.isArray(data)) {
              setAlerts(data);
            }
          } else if (type === 'freeze_requested') {
            const newAlert = {
              id: data.freeze_id || `FREEZE-${Date.now()}`,
              target_account: data.account,
              freeze_amount: data.amount,
              target_bank_ifsc: data.bank,
              cash_out_eta_minutes: data.eta_minutes || 15,
              status: 'PENDING',
              requested_at: new Date().isoformat ? new Date().toISOString() : new Date().toString(),
              window_expires_at: new Date(Date.now() + (data.eta_minutes || 15) * 60000).toISOString()
            };
            setLatestFreeze(newAlert);
            setAlerts((prev) => [newAlert, ...prev.filter(a => a.id !== newAlert.id)]);
          } else if (type === 'freeze_confirmed') {
            setAlerts((prev) =>
              prev.map((item) =>
                item.id === data.freeze_id
                  ? { ...item, status: 'FROZEN', i4c_freeze_id: data.freeze_id }
                  : item
              )
            );
          } else if (type === 'freeze_failed') {
            setAlerts((prev) =>
              prev.map((item) =>
                item.id === data.freeze_id
                  ? { ...item, status: 'FAILED', failure_reason: data.reason }
                  : item
              )
            );
          } else if (type === 'window_expiring') {
            setAlerts((prev) =>
              prev.map((item) =>
                item.id === data.freeze_id
                  ? { ...item, is_expiring_soon: true, minutes_remaining: data.minutes_remaining }
                  : item
              )
            );
          }
        } catch (err) {
          console.error('[FreezeOps WS] Failed to parse message:', err);
        }
      };

      socket.onerror = (err) => {
        console.warn('[FreezeOps WS] Connection error:', err);
        setConnectionStatus('ERROR');
      };

      socket.onclose = () => {
        setConnectionStatus('DISCONNECTED');
        console.log('[FreezeOps WS] Connection closed. Attempting reconnect in 5s...');
        reconnectTimerRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };
    } catch (e) {
      console.error('[FreezeOps WS] WebSocket creation exception:', e);
      setConnectionStatus('ERROR');
    }
  }, []);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connectWebSocket]);

  return { alerts, latestFreeze, connectionStatus };
}

export default useFreezeAlerts;
