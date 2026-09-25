import React from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { Clock, ShieldCheck, Zap, Activity, TrendingUp } from 'lucide-react';
import useTheme from '../../hooks/useTheme';

const InterdictionImpactChart = () => {
  const isLight = useTheme();

  // PRD 5.4 Calibrated Benchmark Data
  const timeToFreezeData = [
    { mode: 'No-Tool Baseline', hours: 36.4, color: '#ef4444' },
    { mode: 'CrimeCast Flow', hours: 2.8, color: '#22c55e' }
  ];

  const interdictionRateData = [
    { mode: 'No-Tool Baseline', rate: 4.8, color: '#ef4444' },
    { mode: 'CrimeCast Flow', rate: 68.4, color: '#f97316' }
  ];

  return (
    <div
      className={`relative rounded-3xl border transition-all p-6 md:p-8 space-y-8 overflow-hidden ${
        isLight
          ? 'bg-white/95 border-orange-500/25 shadow-[0_10px_35px_rgba(99,102,241,0.08)]'
          : 'border-orange-500/30 bg-gradient-to-b from-zinc-950 via-black to-zinc-950 shadow-[0_0_50px_rgba(249,115,22,0.08)]'
      }`}
    >
      {/* Background Ambient Glow Effects */}
      <div
        className={`absolute top-0 right-0 w-96 h-96 rounded-full blur-[100px] pointer-events-none ${
          isLight ? 'bg-orange-500/5' : 'bg-orange-500/10'
        }`}
      />
      <div
        className={`absolute bottom-0 left-0 w-96 h-96 rounded-full blur-[100px] pointer-events-none ${
          isLight ? 'bg-emerald-500/5' : 'bg-emerald-500/10'
        }`}
      />

      {/* Header Bar */}
      <div
        className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10 border-b pb-6 ${
          isLight ? 'border-slate-200' : 'border-zinc-800/80'
        }`}
      >
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                isLight
                  ? 'bg-orange-50 border border-orange-200 text-orange-700 shadow-sm'
                  : 'bg-orange-500/15 border border-orange-500/30 text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.2)]'
              }`}
            >
              <Zap className="w-3 h-3 animate-pulse text-orange-500" />
              HEADLINE INTERDICTION BENCHMARK
            </span>
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wide ${
                isLight
                  ? 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                  : 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
              }`}
            >
              ⚡ [BASED ON CALIBRATED SYNTHETIC DATA]
            </span>
          </div>
          <h2
            className={`text-2xl md:text-3xl font-black uppercase tracking-tight ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            Triage & Dispatch Operational Impact
          </h2>
          <p className={`text-xs font-medium mt-1 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
            Comparing Traditional Manual Police Reporting vs. CrimeCast AI-Driven Interdiction Flow
          </p>
        </div>

        <div
          className={`flex items-center gap-3 p-3 rounded-2xl border ${
            isLight
              ? 'bg-slate-50 border-slate-200 shadow-sm'
              : 'bg-zinc-900/80 border-zinc-800'
          }`}
        >
          <div
            className={`p-2.5 rounded-xl border ${
              isLight
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
            }`}
          >
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
              Headline Outcome
            </p>
            <p className={`text-lg font-black leading-none mt-0.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
              14.25x Interdiction Gain
            </p>
          </div>
        </div>
      </div>

      {/* Main KPI Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
        {/* Metric 1: Time-to-Freeze Reduction */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className={`p-6 rounded-2xl border transition-all space-y-4 ${
            isLight
              ? 'bg-slate-50/80 border-slate-200/90 shadow-sm hover:border-emerald-500/40'
              : 'bg-zinc-900/60 border-zinc-800/80 hover:border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`p-2 rounded-lg border ${
                  isLight
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : 'bg-red-950/40 border-red-500/30 text-red-400'
                }`}
              >
                <Clock className="w-4 h-4" />
              </div>
              <h3 className={`text-sm font-black uppercase tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Time-To-Freeze Reduction
              </h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-black border ${
                isLight
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}
            >
              -92.3% Faster
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div
              className={`p-4 rounded-xl border ${
                isLight
                  ? 'bg-white border-red-200 shadow-sm'
                  : 'bg-black/60 border-red-500/20'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                No-Tool Baseline
              </p>
              <p className={`text-3xl font-black mt-1 ${isLight ? 'text-red-600' : 'text-red-400'}`}>
                36.4 <span className={`text-sm font-bold ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>hrs</span>
              </p>
              <p className={`text-[9px] mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                Manual FIR & Slow Notices
              </p>
            </div>
            <div
              className={`p-4 rounded-xl border ${
                isLight
                  ? 'bg-emerald-50/90 border-emerald-300 shadow-sm'
                  : 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase ${isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>
                CrimeCast AI Flow
              </p>
              <p className={`text-3xl font-black mt-1 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                2.8 <span className={`text-sm font-bold ${isLight ? 'text-emerald-800' : 'text-emerald-500'}`}>hrs</span>
              </p>
              <p className={`text-[9px] mt-1 ${isLight ? 'text-emerald-700' : 'text-emerald-300/80'}`}>
                Instant I4C Nodal Dispatch
              </p>
            </div>
          </div>

          {/* Bar Visualization */}
          <div className="h-28 min-h-[112px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
              <BarChart data={timeToFreezeData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="mode"
                  stroke={isLight ? '#475569' : '#71717a'}
                  fontSize={10}
                  tick={{ fill: isLight ? '#334155' : '#a1a1aa', fontWeight: 600 }}
                  width={110}
                />
                <Tooltip 
                  formatter={(val) => [`${val} Hours`, 'Avg Time-to-Freeze']}
                  contentStyle={{
                    backgroundColor: isLight ? '#ffffff' : '#09090b',
                    borderColor: isLight ? '#cbd5e1' : '#27272a',
                    color: isLight ? '#0f172a' : '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '11px',
                    boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.08)' : 'none'
                  }} 
                />
                <Bar dataKey="hours" radius={[0, 6, 6, 0]} barSize={18}>
                  {timeToFreezeData.map((entry, index) => (
                    <Cell key={`cell-t-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Metric 2: Interdiction Rate (%) */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className={`p-6 rounded-2xl border transition-all space-y-4 ${
            isLight
              ? 'bg-slate-50/80 border-slate-200/90 shadow-sm hover:border-orange-500/40'
              : 'bg-zinc-900/60 border-zinc-800/80 hover:border-orange-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`p-2 rounded-lg border ${
                  isLight
                    ? 'bg-orange-100 text-orange-700 border-orange-200'
                    : 'bg-orange-950/40 border-orange-500/30 text-orange-400'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
              </div>
              <h3 className={`text-sm font-black uppercase tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>
                % Fraud Chains Interdicted
              </h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-black border ${
                isLight
                  ? 'bg-orange-100 text-orange-800 border-orange-300'
                  : 'bg-orange-500/10 text-orange-400 border-orange-500/30'
              }`}
            >
              14.25x Increase
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div
              className={`p-4 rounded-xl border ${
                isLight
                  ? 'bg-white border-red-200 shadow-sm'
                  : 'bg-black/60 border-red-500/20'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                No-Tool Baseline
              </p>
              <p className={`text-3xl font-black mt-1 ${isLight ? 'text-red-600' : 'text-red-400'}`}>
                4.8%
              </p>
              <p className={`text-[9px] mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
                Delayed Reaction / Gone
              </p>
            </div>
            <div
              className={`p-4 rounded-xl border ${
                isLight
                  ? 'bg-orange-50/90 border-orange-300 shadow-sm'
                  : 'bg-orange-950/20 border-orange-500/40 shadow-[0_0_20px_rgba(249,115,22,0.1)]'
              }`}
            >
              <p className={`text-[10px] font-bold uppercase ${isLight ? 'text-orange-800' : 'text-orange-400'}`}>
                CrimeCast AI Flow
              </p>
              <p className={`text-3xl font-black mt-1 ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>
                68.4%
              </p>
              <p className={`text-[9px] mt-1 ${isLight ? 'text-orange-800' : 'text-orange-300/80'}`}>
                Interdicted Before Cash-Out
              </p>
            </div>
          </div>

          {/* Bar Visualization */}
          <div className="h-28 min-h-[112px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
              <BarChart data={interdictionRateData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  type="category"
                  dataKey="mode"
                  stroke={isLight ? '#475569' : '#71717a'}
                  fontSize={10}
                  tick={{ fill: isLight ? '#334155' : '#a1a1aa', fontWeight: 600 }}
                  width={110}
                />
                <Tooltip 
                  formatter={(val) => [`${val}%`, 'Interdiction Success Rate']}
                  contentStyle={{
                    backgroundColor: isLight ? '#ffffff' : '#09090b',
                    borderColor: isLight ? '#cbd5e1' : '#27272a',
                    color: isLight ? '#0f172a' : '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '11px',
                    boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.08)' : 'none'
                  }} 
                />
                <Bar dataKey="rate" radius={[0, 6, 6, 0]} barSize={18}>
                  {interdictionRateData.map((entry, index) => (
                    <Cell key={`cell-i-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Footer Audit Statement */}
      <div
        className={`p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 text-xs relative z-10 font-mono ${
          isLight
            ? 'bg-slate-50 border-slate-200 text-slate-600'
            : 'bg-zinc-950 border-zinc-800 text-zinc-400'
        }`}
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-orange-500 shrink-0" />
          <span>
            <strong>Simulation Methodology (PRD Section 5.4):</strong> Evaluated over N=55,000 calibrated synthetic fraud chains matching published NCRB & RBI macro telemetry.
          </span>
        </div>
        <span
          className={`px-3 py-1 rounded-lg text-[10px] uppercase shrink-0 border ${
            isLight
              ? 'bg-white border-slate-200 text-slate-700 shadow-sm font-semibold'
              : 'bg-zinc-900 border-zinc-800 text-zinc-300'
          }`}
        >
          SIH 2026 Headline Slide Benchmark
        </span>
      </div>
    </div>
  );
};

export default InterdictionImpactChart;
