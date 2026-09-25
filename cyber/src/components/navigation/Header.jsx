import React, { useState, useEffect } from 'react';
import { Menu, Terminal, Sun, Moon, Bell, LogOut, Radio } from 'lucide-react';

const Header = ({
  user, onLogout, navigate, onOpenMobileNav,
  notifications, onOpenNotifications,
  theme, onToggleTheme
}) => {
  const unreadCount = notifications.filter(n => !n.read).length;
  const [wsStatus, setWsStatus] = useState('connected');

  useEffect(() => {
    const handleWsStatus = (e) => {
      if (e.detail?.status) {
        setWsStatus(e.detail.status);
      }
    };
    window.addEventListener('ws:status', handleWsStatus);
    return () => window.removeEventListener('ws:status', handleWsStatus);
  }, []);

  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-8 relative z-10"
            style={theme === 'light' ? {
              background: 'rgba(255,255,255,0.90)',
              backdropFilter: 'blur(20px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
              borderBottom: '1px solid rgba(99,102,241,0.12)',
              boxShadow: '0 2px 16px rgba(99,102,241,0.07)',
            } : {
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(20px) saturate(1.3)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
              borderBottom: '1px solid rgba(249,115,22,0.12)',
            }}>
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenMobileNav}
          className="md:hidden p-2 text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 hidden sm:flex">
           <Terminal className="w-4 h-4 text-orange-500/60" />
           <span className="text-[11px] font-black uppercase tracking-widest gradient-text">CRIMECAST_PREDICT_v3.0</span>
        </div>

        {/* Live Telemetry Status Badge */}
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-mono shadow-inner ${
          theme === 'light'
            ? 'bg-white/80 border-indigo-100'
            : 'bg-zinc-900/80 border-zinc-800'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            wsStatus === 'connected'
              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)] animate-pulse'
              : wsStatus === 'reconnecting'
              ? 'bg-amber-500 animate-ping'
              : 'bg-red-500'
          }`} />
          <Radio className={`w-3 h-3 ${wsStatus === 'connected' ? 'text-emerald-400' : 'text-zinc-500'}`} />
          <span className="text-zinc-400 font-bold uppercase tracking-wider hidden lg:inline">Telemetry:</span>
          <span className={wsStatus === 'connected' ? 'text-emerald-400 font-bold' : wsStatus === 'reconnecting' ? 'text-amber-400 font-bold' : 'text-red-400 font-bold'}>
            {wsStatus === 'connected' ? 'LIVE STREAM' : wsStatus === 'reconnecting' ? 'RECONNECTING' : 'OFFLINE'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-6 overflow-x-auto max-w-full custom-scrollbar">
        <button
          onClick={onToggleTheme}
          className="p-2 text-zinc-500 hover:text-orange-400 transition-all hover:drop-shadow-[0_0_6px_rgba(249,115,22,0.4)]"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="relative cursor-pointer group" onClick={onOpenNotifications}>
          <Bell className="w-5 h-5 text-zinc-500 group-hover:text-orange-400 transition-all group-hover:drop-shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black text-white animate-pulse"
                  style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }}>
              {unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 pl-4 md:pl-6"
             style={{ borderLeft: '1px solid rgba(249,115,22,0.12)' }}>
          <div className="text-right cursor-pointer hidden sm:block" onClick={() => navigate('profile')}>
             <p className="text-[11px] font-black gradient-text-accent uppercase tracking-wider">
               {user?.name || user?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || 'Operator'}
             </p>
             <p className="text-[9px] text-zinc-500 uppercase font-bold">
               {user?.role || 'ANALYST'}
               {user?.current_device && <span className="ml-2 px-1.5 py-0.5 bg-orange-900/30 text-orange-400 rounded border border-orange-500/30">{user.current_device}</span>}
             </p>
          </div>
          <div
            onClick={() => navigate('profile')}
            className="w-9 h-9 rounded-xl text-black font-black flex items-center justify-center cursor-pointer hover:scale-110 transition-all hover:shadow-[0_0_15px_rgba(249,115,22,0.4)]"
            style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }}
          >
             {user?.avatar_initials ||
             (user?.name || user?.username || 'OP').slice(0,2).toUpperCase()}
          </div>
          <button onClick={onLogout} className="p-2 text-zinc-500 hover:text-red-400 transition-all hover:drop-shadow-[0_0_6px_rgba(239,68,68,0.4)]">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
