import React, { useRef, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import Breadcrumbs from './Breadcrumbs';
import TriageSidebar from './TriageSidebar';
import PageRenderer from './PageRenderer';
import { Toaster } from 'react-hot-toast';
import NLQOverlay from '../ui/NLQOverlay';
import { GlobalStyles } from '../ui/Common';
import { Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { wsManager } from '../../utils/websocketManager';
import FreezeCountdownBanner from '../ui/FreezeCountdownBanner';

const AppLayout = ({
  user,
  activePage,
  navigate,
  isSidebarOpen,
  setSidebarOpen,
  isTriageOpen,
  setTriageOpen,
  theme,
  toggleTheme,
  handleLogout,
  // NLQ state
  isNLQOpen,
  setNLQOpen,
  // Notifications
  notifications,
  unreadCount,
  markAllAsRead,
  onOpenNotifications,
  // User update
  onUpdateUser,
}) => {
  const mainRef = useRef(null);

  // Scroll main container to top on route change
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [activePage]);

  // WebSocket status tracking
  const [wsStatus, setWsStatus] = React.useState('connected');
  useEffect(() => {
    const handleWsStatus = (e) => {
      if (e.detail?.status) {
        setWsStatus(e.detail.status);
      }
    };
    window.addEventListener('ws:status', handleWsStatus);
    return () => window.removeEventListener('ws:status', handleWsStatus);
  }, []);

  const touchStartX = useRef(null);
  const touchEndX = useRef(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    // Only apply swipe logic on mobile screens
    if (window.innerWidth < 768) {
      if (isRightSwipe && !isSidebarOpen) {
        setSidebarOpen(true);
      }
      if (isLeftSwipe && isSidebarOpen) {
        setSidebarOpen(false);
      }
    }
    
    // Reset values
    touchStartX.current = null;
    touchEndX.current = null;
  };

  return (
    <div 
      className={`min-h-screen grid-bg overflow-hidden flex ${theme === 'light' ? 'light-mode' : ''}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <GlobalStyles />
      
      <Toaster position="top-right" toastOptions={{
        style: theme === 'light'
          ? { background: '#ffffff', color: '#1e293b', border: '1px solid rgba(249,115,22,0.3)', fontSize: '12px', fontWeight: 'bold', boxShadow: '0 4px 20px rgba(99,102,241,0.12)' }
          : { background: '#080808', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)', fontSize: '12px', fontWeight: 'bold' }
      }} />

      {/* Mobile Hamburger overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[150] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Unified Sidebar */}
      <Sidebar 
        user={user}
        currentPage={activePage}
        navigate={navigate}
        collapsed={!isSidebarOpen}
        onToggleCollapse={() => setSidebarOpen(!isSidebarOpen)}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 relative h-screen">
        {/* Unified Header */}
        <Header 
          user={user}
          onLogout={handleLogout}
          navigate={navigate}
          onOpenMobileNav={() => setSidebarOpen(true)}
          notifications={notifications}
          onOpenNotifications={onOpenNotifications || markAllAsRead}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Global Freeze Interdiction Alert Banner */}
        <FreezeCountdownBanner />

        {/* Horizontal Workspace: Main Content (Left/Center) + Triage Alert Center (Right) */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
            
            {/* Breadcrumbs & NLQ Quick bar */}
            <div className={`px-6 py-4 border-b flex items-center justify-between flex-shrink-0 ${theme === 'light' ? 'border-indigo-100 bg-white/60 backdrop-blur-sm' : 'border-zinc-800/60 bg-black/20'}`}>
              <Breadcrumbs path={activePage} />
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 mr-2">
                   <div className={`w-2 h-2 rounded-full ${wsStatus === 'connected' ? 'bg-orange-500 animate-pulse' : 'bg-red-500'}`} title={wsStatus === 'connected' ? 'Real-time telemetry active' : 'Telemetry disconnected'} />
                   {wsStatus === 'disconnected' && (
                     <button 
                       onClick={() => wsManager.reconnectAll()} 
                       className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:text-white transition-colors"
                     >
                       Reconnect
                     </button>
                   )}
                 </div>
                 <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest hidden md:block">NodeID: CC-CRIMECAST-01</span>
                 <button 
                   onClick={() => setNLQOpen(true)} 
                   className="p-2 text-zinc-500 hover:text-orange-400 transition-colors flex items-center gap-2"
                   title="Search (Ctrl+K)"
                 >
                   <Search className="w-4 h-4" />
                   <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[8px] bg-zinc-900 border border-zinc-800 rounded text-zinc-400 font-sans font-black">⌘K</kbd>
                 </button>
              </div>
            </div>

            {/* Main content scrollable with page transitions */}
            <div 
              ref={mainRef}
              className="flex-1 p-6 overflow-y-auto custom-scrollbar relative min-h-0"
            >
              <AnimatePresence mode="wait">
                <motion.div 
                  key={activePage} 
                  initial={{ opacity: 0, y: 8 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, y: -8 }} 
                  transition={{ duration: 0.15 }}
                  className="w-full min-h-full"
                >
                  <PageRenderer activePage={activePage} user={user} navigate={navigate} onUpdateUser={onUpdateUser} />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>

          {/* Incident Triage Assistant (Right Sidebar) */}
          <TriageSidebar 
            isOpen={isTriageOpen} 
            onClose={() => setTriageOpen(false)} 
            onOpen={() => setTriageOpen(true)}
            navigate={navigate}
          />
        </div>
      </div>

      {/* Global NLQ Modal overlay */}
      <NLQOverlay 
        isOpen={isNLQOpen}
        onClose={() => setNLQOpen(false)}
      />
    </div>
  );
};

export default React.memo(AppLayout);
