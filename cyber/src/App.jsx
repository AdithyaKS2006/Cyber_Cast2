import React, { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import AppLayout from './components/navigation/AppLayout';
import LandingPage from './components/pages/LandingPage';
import { LoadingScreen } from './components/ui/Common';
import { INITIAL_NOTIFICATIONS } from './constants';
import CookieConsent from './components/ui/CookieConsent';
import NotificationCenter from './components/ui/NotificationCenter';
import DemoControlPanel from './components/demo/DemoControlPanel';
import { wsManager } from './utils/websocketManager';
import apiClient from './utils/apiClient';
import ErrorBoundary from './components/ui/ErrorBoundary';

const normalizeUser = (userData) => {
  if (!userData) return null;
  let roleStr = typeof userData.role === 'object' && userData.role !== null
    ? (userData.role.name || userData.role.title || JSON.stringify(userData.role))
    : String(userData.role || 'operator');
  roleStr = roleStr.charAt(0).toUpperCase() + roleStr.slice(1).toLowerCase();

  let nameStr = userData.name || userData.full_name ||
    `${userData.first_name || ''} ${userData.last_name || ''}`.trim() ||
    userData.username || 'Operator';
  if (typeof nameStr === 'object' && nameStr !== null) nameStr = JSON.stringify(nameStr);

  let devStr = userData.current_device;
  if (typeof devStr === 'object' && devStr !== null) devStr = JSON.stringify(devStr);

  return {
    ...userData,
    name: String(nameStr),
    role: String(roleStr),
    current_device: devStr ? String(devStr) : undefined,
  };
};

const resolvePathToPage = (pathname) => {
  if (!pathname) return null;
  const clean = pathname.replace(/^\/app\/?/, '').replace(/^\//, '').replace(/\/$/, '');
  if (!clean) return null;
  if (clean === 'predictions' || clean === 'predictions/map') return 'predictions/heatmap';
  if (clean === 'freeze' || clean === 'freeze/queue') return 'freeze-ops';
  return clean;
};

const App = () => {
  // --- Auth & Session ---
  const [user, setUser] = useState(null); // Never persisted to localStorage — re-hydrated from API on load
  const [activePage, setActivePage] = useState(() => {
    if (typeof window !== 'undefined') {
      const fromUrl = resolvePathToPage(window.location.pathname);
      if (fromUrl) return fromUrl;
    }
    try {
      return JSON.parse(localStorage.getItem('cyber_page')) || 'landing';
    } catch {
      return 'landing';
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  // --- UI State ---
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [isSidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 768 : true);
  const [isTriageOpen, setTriageOpen] = useState(false);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);

  // --- NLQ State ---
  const [isNLQOpen, setNLQOpen] = useState(false);
  const [isNotificationCenterOpen, setNotificationCenterOpen] = useState(false);

  // Redirect to app if user session is re-hydrated
  useEffect(() => {
    if (user && (activePage === 'landing' || activePage === 'login' || activePage === 'register')) {
      const fromUrl = resolvePathToPage(window.location.pathname);
      const target = fromUrl || 'predictions/heatmap';
      setActivePage(target);
      try {
        window.history.replaceState({ page: target }, '', `/app/${target}`);
      } catch {}
    }
  }, [user, activePage]);

  // Sync browser back/forward buttons
  useEffect(() => {
    const handlePopState = (e) => {
      const fromState = e.state?.page;
      const fromUrl = resolvePathToPage(window.location.pathname);
      const target = fromState || fromUrl || (user ? 'predictions/heatmap' : 'landing');
      setActivePage(target);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user]);

  useEffect(() => {
    localStorage.setItem('cyber_page', JSON.stringify(activePage));
  }, [activePage]);

  // Initialize websockets on mount if user is already logged in
  useEffect(() => {
    if (user && activePage !== 'landing') {
      wsManager.initialize();
    }
  }, [user]);

  // Sync theme
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Keyboard shortcuts (Cmd+K for NLQ)
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setNLQOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Re-hydrate session from backend API or demo storage on page load
  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await apiClient('/api/v1/users/me/', { method: 'GET' });
        if (res.ok) {
          const userData = await res.json();
          setUser(normalizeUser(userData));
        } else {
          const savedDemoUser = localStorage.getItem('crimecast_demo_user');
          if (savedDemoUser) {
            try {
              setUser(normalizeUser(JSON.parse(savedDemoUser)));
            } catch {
              setUser(null);
            }
          } else {
            setUser(null);
          }
        }
      } catch {
        const savedDemoUser = localStorage.getItem('crimecast_demo_user');
        if (savedDemoUser) {
          try {
            setUser(normalizeUser(JSON.parse(savedDemoUser)));
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } finally {
        setIsLoading(false);
      }
    };
    verifySession();
  }, []);

  // Handlers
  const handleLogin = useCallback((userData) => {
    const normalizedUser = normalizeUser(userData);
    setUser(normalizedUser);
    const fromUrl = resolvePathToPage(window.location.pathname);
    const nextPage = fromUrl || 'predictions/heatmap';
    setActivePage(nextPage);
    try {
      window.history.pushState({ page: nextPage }, '', `/app/${nextPage}`);
    } catch {}
    wsManager.initialize();
    toast.success(`Access granted: ${normalizedUser.role}`);
  }, []);

  const handleLogout = useCallback(() => {
    wsManager.disconnectAll();
    localStorage.removeItem('crimecast_demo_user');
    setUser(null);
    setActivePage('landing');
    try {
      window.history.pushState({ page: 'landing' }, '', '/');
    } catch {}
    toast("Protocol terminated", { icon: '🚫' });
  }, []);

  const navigate = useCallback((page) => {
    window.scrollTo(0, 0);
    if (!user && !['landing', 'login', 'register'].includes(page)) {
      setActivePage('landing');
      return;
    }
    setActivePage(page);
    try {
      const newPath = page === 'landing' ? '/' : `/app/${page}`;
      if (window.location.pathname !== newPath) {
        window.history.pushState({ page }, '', newPath);
      }
    } catch {}
  }, [user]);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const handleOpenNotifications = useCallback(() => {
    setNotificationCenterOpen(true);
    markAllAsRead();
  }, [markAllAsRead]);

  const handleUpdateUser = useCallback((updatedUser) => {
    setUser(normalizeUser(updatedUser));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  useEffect(() => {
    if (user) {
      wsManager.initialize();
    }
    return () => {
      wsManager.disconnectAll();
    };
  }, [user]);

  if (isLoading) return <LoadingScreen />;

  if (!user || activePage === 'landing') {
    return (
      <>
        <LandingPage 
          navigate={navigate}
          onLogin={handleLogin} 
        />
        <CookieConsent />
        <Toaster position="top-right" />
      </>
    );
  }

  const isDemoActive = import.meta.env.DEV || (typeof window !== 'undefined' && window.location.search.includes('demo=true'));

  return (
    <>
      <ErrorBoundary>
        <AppLayout 
          user={user}
          activePage={activePage}
          navigate={navigate}
          isSidebarOpen={isSidebarOpen}
          setSidebarOpen={setSidebarOpen}
          isTriageOpen={isTriageOpen}
          setTriageOpen={setTriageOpen}
          theme={theme}
          toggleTheme={toggleTheme}
          handleLogout={handleLogout}
          isNLQOpen={isNLQOpen}
          setNLQOpen={setNLQOpen}
          notifications={notifications}
          unreadCount={notifications.filter(n => !n.read).length}
          markAllAsRead={markAllAsRead}
          onOpenNotifications={handleOpenNotifications}
          onUpdateUser={handleUpdateUser}
        />
      </ErrorBoundary>
      <CookieConsent />
      <NotificationCenter 
        isOpen={isNotificationCenterOpen}
        onClose={() => setNotificationCenterOpen(false)}
        notifications={notifications}
        setNotifications={setNotifications}
        navigate={navigate}
      />
      {isDemoActive && <DemoControlPanel />}
    </>
  );
};

export default App;
