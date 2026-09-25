import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Plus, Upload, ChevronRight,
  ClipboardList, AlertTriangle, X, RefreshCw,
  FolderLock, ShieldCheck, MapPin, Send
} from 'lucide-react';

import apiClient from '../../utils/apiClient';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import PageTransition from '../ui/PageTransition';

// ── Constants ─────────────────────────────────────────────────────────────
const STATUS_META = {
  NEW:              { label: 'New',              cls: 'bg-blue-900/30 text-blue-400 border-blue-500/30' },
  UNDER_ANALYSIS:   { label: 'Under Analysis',   cls: 'bg-orange-900/30 text-orange-400 border-orange-500/30' },
  PREDICTION_ACTIVE:{ label: 'Prediction Active',cls: 'bg-purple-900/30 text-purple-400 border-purple-500/30' },
  INTERCEPTED:      { label: 'Intercepted',       cls: 'bg-green-900/30 text-green-400 border-green-500/30' },
  CLOSED:           { label: 'Closed',            cls: 'bg-zinc-800/40 text-zinc-500 border-zinc-600/30' },
  FALSE_ALARM:      { label: 'False Alarm',       cls: 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30' },
};

const PRIORITY_META = {
  CRITICAL: { label: 'CRITICAL', cls: 'bg-red-900/30 text-red-400 border-red-500/30' },
  HIGH:     { label: 'HIGH',     cls: 'bg-orange-900/30 text-orange-400 border-orange-500/30' },
  MEDIUM:   { label: 'MEDIUM',   cls: 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30' },
  LOW:      { label: 'LOW',      cls: 'bg-zinc-800/30 text-zinc-500 border-zinc-600/30' },
};

// ── StatusBadge ───────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.NEW;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
  );
};

const PriorityBadge = ({ priority }) => {
  const m = PRIORITY_META[priority] || PRIORITY_META.LOW;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${m.cls}`}>
      {m.label}
    </span>
  );
};

// ── CSV Upload Modal ──────────────────────────────────────────────────────
const CSVUploadModal = ({ onClose }) => {
  const fileRef = useRef();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient('/api/v1/complaints/import-csv/', {
        method: 'POST', body: fd, skipContentType: true,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.message || `Upload failed with status ${res.status}`);
      }
      const data = await res.json();
      setResult({ success: true, message: `Imported ${data.imported ?? '?'} complaints` });
    } catch (e) {
      setResult({ success: false, message: e.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-96 rounded-2xl border border-orange-500/20 p-6 space-y-5"
           style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.95), rgba(10,10,10,0.98))' }}>
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-black uppercase tracking-widest text-white">Bulk CSV Import</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-zinc-500 hover:text-white" /></button>
        </div>

        <p className="text-[10px] text-zinc-500 font-bold uppercase">
          Upload a CSV with columns: victim_name, phone, fraud_amount, fraud_method, district, state, narrative
        </p>

        <div
          className="border-2 border-dashed border-orange-500/30 rounded-xl p-8 text-center cursor-pointer hover:border-orange-500/60 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-orange-400 mx-auto mb-2" />
          <p className="text-[10px] text-zinc-400 font-bold uppercase">
            {file ? file.name : 'Click to select CSV file'}
          </p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
                 onChange={e => setFile(e.target.files?.[0] || null)} />
        </div>

        {result && (
          <p className={`text-[10px] font-black uppercase text-center ${result.success ? 'text-green-400' : 'text-red-400'}`}>
            {result.message}
          </p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose}
                  className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase bg-zinc-900 text-zinc-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={handleUpload} disabled={!file || uploading}
                  className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-colors disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)', color: 'black' }}>
            {uploading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────
const ComplaintsDashboard = ({ navigate }) => {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCSV, setShowCSV] = useState(false);
  const isLight = document.documentElement.classList.contains('light-mode');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchComplaints = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await apiClient(`/api/v1/complaints/?${params}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setComplaints(Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []));
    } catch (e) {
      const msg = typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e);
      setError(msg || 'Failed to fetch complaints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchComplaints(); }, [statusFilter, dateFrom, dateTo]);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(fetchComplaints, 400);
    return () => clearTimeout(t);
  }, [search]);

  const formatAmount = (n) =>
    n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` :
    n >= 1000   ? `₹${(n / 1000).toFixed(1)}K`   : `₹${n}`;

  const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

  return (
    <PageTransition>
    <div className="min-h-screen p-4 sm:p-6 space-y-4 sm:space-y-6" style={{ background: isLight ? 'transparent' : 'linear-gradient(135deg, #000000, #080808)' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-orange-400" />
            <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">Complaints</h1>
          </div>
          <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
            Cybercrime complaint registry · {complaints.length} records
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowCSV(true)}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl text-[9px] sm:text-[10px]
                             font-black uppercase text-orange-400 hover:border-orange-500/50 transition-all active:scale-95 touch-feedback"
                  style={isLight
                    ? { background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(249,115,22,0.25)' }
                    : { background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(249,115,22,0.2)' }}>
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bulk Import</span>
          </button>
          <button onClick={() => navigate('complaints/new')}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl text-[9px] sm:text-[10px]
                             font-black uppercase transition-all hover:opacity-90 active:scale-95 touch-feedback"
                  style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)', color: '#fff' }}>
            <Plus className="w-3.5 h-3.5" />
            New Complaint
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search victim name or complaint #…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[11px] placeholder:text-zinc-600
                       focus:outline-none transition-colors"
            style={isLight
              ? { background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(99,102,241,0.18)', color: '#1e293b' }
              : { background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(39,39,42,0.8)', color: '#fff' }}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none px-3 py-2.5 rounded-xl text-[11px] focus:outline-none transition-colors"
            style={isLight
              ? { background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(99,102,241,0.18)', color: '#1e293b' }
              : { background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(39,39,42,0.8)', color: '#d4d4d8' }}
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button
            onClick={fetchComplaints}
            disabled={loading}
            className="p-2.5 rounded-xl text-zinc-500 hover:text-orange-400 transition-all active:scale-95"
            style={isLight
              ? { background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(99,102,241,0.18)' }
              : { background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(39,39,42,0.8)' }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden border"
        style={isLight
          ? { background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.12)', boxShadow: '0 4px 24px rgba(99,102,241,0.07)' }
          : { background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(16px)', borderColor: 'rgba(63,63,70,0.6)' }}
      >
        {error ? (
          <ErrorState message="Failed to load complaints" detail={error} onRetry={fetchComplaints} />
        ) : !loading && complaints.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No complaints found"
            message={search || statusFilter
              ? 'Try adjusting your search filters.'
              : 'No cybercrime complaints registered yet. File the first complaint to begin.'}
            action={{ label: 'File Complaint', onClick: () => navigate('complaints/new') }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(249,115,22,0.10)' }}>
                  {['#', 'Date', 'Victim', 'Amount', 'Method', 'Status', 'Priority', 'Actions', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-zinc-600">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }, (_, i) => <Skeleton.Row key={i} cols={9} />)
                  : complaints.map((c, idx) => (
                    <tr
                      key={c.id}
                      onClick={() => c.id && navigate(`complaints/${c.id}`)}
                      className="cursor-pointer transition-colors hover:bg-orange-500/[0.04]
                                 active:bg-orange-500/10 group touch-feedback"
                      style={{ borderBottom: isLight ? '1px solid rgba(99,102,241,0.08)' : '1px solid rgba(255,255,255,0.03)' }}
                    >
                      <td className="px-4 py-3 text-[10px] font-black text-orange-400 whitespace-nowrap">
                        {c.complaint_number || `#${idx + 1}`}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-[10px] text-zinc-400 whitespace-nowrap">
                        {formatDate(c.complaint_timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <div className={`text-[11px] font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>{c.victim_name || '—'}</div>
                        <div className="text-[9px] text-zinc-500">{c.victim_phone || ''}</div>
                      </td>
                      <td className={`px-4 py-3 text-[11px] font-black whitespace-nowrap ${isLight ? 'text-slate-800' : 'text-white'}`}>
                        {formatAmount(c.fraud_amount)}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-[10px] text-zinc-400 uppercase font-bold">
                        {typeof c.fraud_method === 'object' && c.fraud_method !== null ? (c.fraud_method.name || JSON.stringify(c.fraud_method)) : String(c.fraud_method || '—')}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                      <td className="hidden sm:table-cell px-4 py-3"><PriorityBadge priority={c.priority} /></td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => navigate(`evidence/${c.id}`)}
                            title="Open Evidence Locker"
                            className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 transition"
                          >
                            <FolderLock className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => navigate('predictions/heatmap')}
                            title="View ATM Cash-Out Heatmap"
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => navigate('freeze-ops')}
                            title="Freeze Mule Account"
                            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-orange-400 transition-colors" />
                      </td>
                    </tr>
                  ))
                }
              </tbody>

            </table>
          </div>
        )}
      </motion.div>

      {showCSV && <CSVUploadModal onClose={() => { setShowCSV(false); fetchComplaints(); }} />}
    </div>
    </PageTransition>
  );
};

export default ComplaintsDashboard;
