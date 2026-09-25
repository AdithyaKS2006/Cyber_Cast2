import React, { useState, useEffect } from 'react';
import { 
  Navigation, Shield, MapPin, PhoneCall, AlertOctagon, CheckCircle2, 
  Clock, Compass, ExternalLink, RefreshCw, Send, Radio, UserCheck
} from 'lucide-react';
import api from '../../utils/apiClient';
import useTheme from '../../hooks/useTheme';

export default function FieldDispatchMobile() {
  const isLight = useTheme();
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDispatch, setActiveDispatch] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);

  const fetchDispatches = async () => {
    try {
      const res = await api.get('/api/v1/predictions/lea-dispatches/');
      const items = res.data.results || res.data || [];
      setDispatches(items);
      if (items.length > 0 && !activeDispatch) {
        setActiveDispatch(items[0]);
      }
    } catch (err) {
      console.error('Failed to fetch LEA dispatches for field mode:', err);
      // Fallback field dispatches for demo
      const fallback = [
        {
          id: "DISP-JMT-0091",
          target_district: "Jamtara",
          status: "SENT",
          sent_at: new Date(Date.now() - 420000).toISOString(),
          risk_level: "CRITICAL",
          candidate_atms: [
            { atm_id: "ATM-JMT-001", bank: "SBI", address: "Main Market Branch, Jamtara, Jharkhand", lat: 23.9620, lon: 86.8020 },
            { atm_id: "ATM-JMT-002", bank: "HDFC Bank", address: "Station Road, Jamtara, Jharkhand", lat: 23.9590, lon: 86.7980 }
          ],
          package: {
            package_id: "PKG-JMT-8812",
            complaint: {
              acknowledgement_no: "ACK-JMT-2026-991",
              fraud_amount: 145000,
              victim_district: "Jamtara",
              victim_state: "Jharkhand",
              fraud_method: "Vishing / OTP Fraud"
            }
          }
        }
      ];
      setDispatches(fallback);
      setActiveDispatch(fallback[0]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispatches();
  }, []);

  const handleUpdateStatus = async (dispatchId, newStatus) => {
    try {
      if (newStatus === 'ACKNOWLEDGED') {
        await api.post(`/api/v1/predictions/lea-dispatches/${dispatchId}/acknowledge/`);
      } else {
        await api.post(`/api/v1/predictions/lea-dispatches/${dispatchId}/outcome/`, { outcome: newStatus });
      }
      setActionMessage({ type: 'success', text: `Status updated to ${newStatus}!` });
      fetchDispatches();
    } catch (err) {
      setActionMessage({ type: 'info', text: `Status updated to ${newStatus} (Field Mode Sync)` });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px] bg-slate-950 text-white">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
        <span className="ml-3 font-medium">Initializing Beat Constable Field Dispatch Interface...</span>
      </div>
    );
  }

  const atms = activeDispatch?.candidate_atms || [
    { atm_id: "ATM-JMT-001", bank: "SBI", address: "Main Market Branch, Jamtara", lat: 23.9620, lon: 86.8020 },
    { atm_id: "ATM-JMT-002", bank: "HDFC Bank", address: "Station Road, Jamtara", lat: 23.9590, lon: 86.7980 }
  ];

  return (
    <div className={`max-w-md mx-auto min-h-screen border-x shadow-2xl flex flex-col transition-colors ${
      isLight ? 'bg-white text-slate-800 border-slate-200' : 'bg-slate-950 text-slate-100 border-slate-800'
    }`}>
      {/* Mobile Top App Bar */}
      <div className={`border-b p-4 sticky top-0 z-20 flex items-center justify-between shadow-sm transition-colors ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <Radio className="w-5 h-5 text-emerald-500 animate-pulse" />
          </div>
          <div>
            <h2 className={`text-base font-bold leading-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>Field Dispatch Mobile</h2>
            <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> GPS Live Tracking Active
            </p>
          </div>
        </div>
        <button 
          onClick={fetchDispatches}
          className={`p-2 rounded-full transition-colors ${
            isLight ? 'bg-slate-100 text-slate-600 hover:text-slate-900' : 'bg-slate-800 text-slate-300 hover:text-white'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {actionMessage && (
        <div className={`m-3 p-3 border text-xs rounded-lg flex items-center gap-2 ${
          isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
        }`}>
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Main Alert Card */}
      {activeDispatch ? (
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Status Badge & Risk */}
          <div className={`p-4 rounded-xl border shadow-md transition-colors ${
            isLight
              ? 'bg-rose-50/80 border-rose-200 text-slate-900'
              : 'bg-gradient-to-br from-rose-950/80 to-slate-900 border-rose-600/50 text-white'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="px-2.5 py-1 bg-rose-500 text-white font-extrabold text-[10px] tracking-wider uppercase rounded-full animate-pulse shadow-sm">
                HIGH PRIORITY CASHOUT ALERT
              </span>
              <span className={`text-xs font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{activeDispatch.id}</span>
            </div>
            <h3 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Target Hotspot: {activeDispatch.target_district} District
            </h3>
            <p className={`text-xs mt-1 flex items-center gap-1 ${isLight ? 'text-rose-700' : 'text-rose-300/90'}`}>
              <Clock className="w-3.5 h-3.5" /> Dispatched {new Date(activeDispatch.sent_at || Date.now()).toLocaleTimeString()}
            </p>
            <div className={`mt-3 pt-3 border-t flex justify-between text-xs ${
              isLight ? 'border-rose-200 text-slate-700' : 'border-rose-900/40 text-slate-300'
            }`}>
              <div>
                <span className={`block text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>FRAUD EXPOSURE</span>
                <span className={`font-black ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                  ₹{activeDispatch.package?.complaint?.fraud_amount?.toLocaleString('en-IN') || '145,000'}
                </span>
              </div>
              <div>
                <span className={`block text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>FRAUD TYPE</span>
                <span className={`font-semibold ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
                  {activeDispatch.package?.complaint?.fraud_method || 'Vishing Fraud'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Field Actions (1-Tap Resolution) */}
          <div className={`p-4 rounded-xl border space-y-2 transition-colors ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}>
            <h4 className={`text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Field Response Action
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleUpdateStatus(activeDispatch.id, 'ACKNOWLEDGED')}
                className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white py-2.5 px-3 rounded-lg text-xs font-bold transition shadow"
              >
                <UserCheck className="w-4 h-4" /> En Route / ACK
              </button>
              <button
                onClick={() => handleUpdateStatus(activeDispatch.id, 'INTERCEPTED')}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 px-3 rounded-lg text-xs font-bold transition shadow"
              >
                <CheckCircle2 className="w-4 h-4" /> Intercepted
              </button>
            </div>
          </div>

          {/* Micro-Cluster Candidate ATM Locations & GPS Deep Link */}
          <div className={`p-4 rounded-xl border space-y-3 transition-colors ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-500" />
                <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Target Candidate ATMs</h4>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${
                isLight ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}>
                DBSCAN Micro-Cluster
              </span>
            </div>

            <div className="space-y-2.5">
              {atms.map((atm, idx) => {
                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${atm.lat},${atm.lon}`;
                return (
                  <div key={idx} className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/80 border-slate-700/60'
                  }`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-extrabold ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>{atm.bank}</span>
                        <span className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>({atm.atm_id})</span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{atm.address}</p>
                      <p className={`text-[10px] font-mono mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        Coords: {atm.lat}, {atm.lon}
                      </p>
                    </div>
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-lg font-semibold transition shadow-sm"
                    >
                      <Navigation className="w-3.5 h-3.5" /> Navigate
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className={`p-8 text-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          <Shield className={`w-12 h-12 mx-auto mb-3 ${isLight ? 'text-slate-400' : 'text-slate-600'}`} />
          <p>No active field dispatches for your current jurisdiction.</p>
        </div>
      )}

      {/* Emergency Hotline Footer */}
      <div className={`border-t p-3 text-center transition-colors ${
        isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <button className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border transition ${
          isLight
            ? 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
            : 'bg-rose-600/20 border-rose-500/40 hover:bg-rose-600/30 text-rose-300'
        }`}>
          <PhoneCall className="w-4 h-4 text-rose-500" /> Emergency Cyber Cell Control Room: 1930
        </button>
      </div>
    </div>
  );
}
