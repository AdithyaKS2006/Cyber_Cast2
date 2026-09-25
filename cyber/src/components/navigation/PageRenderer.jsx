import React, { Suspense, lazy } from 'react';
import ErrorBoundary from '../ui/ErrorBoundary';
import { LoadingScreen } from '../ui/Common';

// Core pages — only what serves the loop
const CrimeCastDashboard    = lazy(() => import('../pages/Dashboard'));
const ComplaintsDashboard   = lazy(() => import('../complaints/ComplaintsDashboard'));
const ComplaintForm         = lazy(() => import('../complaints/ComplaintForm'));
const ComplaintDetail       = lazy(() => import('../complaints/ComplaintDetail'));
const PredictionMap         = lazy(() => import('../predictions/PredictionMap'));
const PredictionDetail      = lazy(() => import('../predictions/PredictionDetail'));
const AlertCenter           = lazy(() => import('../alerts/AlertCenter'));
const FreezeOpsDashboard    = lazy(() => import('../freeze/FreezeOpsDashboard'));
const EvidenceLocker        = lazy(() => import('../evidence/EvidenceLocker'));
const FieldDispatchMobile   = lazy(() => import('../pages/FieldDispatchMobile'));
const ProfilePage           = lazy(() => import('../pages/ProfilePage'));
const ModelMetrics          = lazy(() => import('../pages/ModelMetrics'));
const GatewayMonitor        = lazy(() => import('../pages/GatewayMonitor'));
const MFASetupPage          = lazy(() => import('../pages/MFASetupPage'));
const CrossJurisdictionRollup = lazy(() => import('../pages/CrossJurisdictionRollup'));
const SyndicateSimulator    = lazy(() => import('../pages/SyndicateSimulator'));
const AccessDeniedPage      = lazy(() => import('../pages/AccessDeniedPage'));
const NotFoundPage          = lazy(() => import('../pages/NotFoundPage'));
import LandingPage from '../pages/LandingPage';

const PageRenderer = ({ activePage, currentPage, navigate, user, onUpdateUser }) => {
  const targetPage = activePage || currentPage;

  const renderPage = () => {
    switch (targetPage) {
      case 'landing':
        return <LandingPage onEnter={() => navigate('dashboard')} onLogin={onUpdateUser} navigate={navigate} />;

      case 'dashboard':
        return <CrimeCastDashboard navigate={navigate} />;

      // ── COMPLAINTS ──────────────────────────────────────────
      case 'complaints':
        return <ComplaintsDashboard navigate={navigate} />;
      case 'complaints/new':
        return <ComplaintForm navigate={navigate} />;

      // ── LIVE MAP & PREDICTIONS ────────────────────────────────
      case 'predictions/heatmap':
      case 'predictions/map':
      case 'predictions':
        return <PredictionMap navigate={navigate} initialMode="heatmap" />;
      case 'predictions/active':
        return <PredictionMap navigate={navigate} initialMode="active" />;
      case 'model-metrics':
        return <ModelMetrics navigate={navigate} />;

      // ── OPERATIONS ───────────────────────────────────────────
      case 'alerts':
        return <AlertCenter navigate={navigate} />;
      case 'freeze-ops':
      case 'freeze/queue':
      case 'freeze':
        return <FreezeOpsDashboard navigate={navigate} />;
      case 'evidence-locker':
        return <EvidenceLocker navigate={navigate} />;
      case 'intelligence/mule-network':
      case 'syndicate-simulator':
        return <SyndicateSimulator navigate={navigate} />;
      case 'gateway-monitor':
        return <GatewayMonitor navigate={navigate} />;
      case 'lea-dispatches':
      case 'analytics':
        return <CrossJurisdictionRollup navigate={navigate} />;

      // ── FIELD ────────────────────────────────────────────────
      case 'field-mobile':
        return <FieldDispatchMobile navigate={navigate} />;

      // ── SYSTEM ───────────────────────────────────────────────
      case 'profile':
      case 'settings':
        return <ProfilePage user={user} onUpdateUser={onUpdateUser} navigate={navigate} />;
      case 'auth/mfa/setup':
      case 'mfa-setup':
        return <MFASetupPage navigate={navigate} />;

      // ── DYNAMIC ROUTES ───────────────────────────────────────
      default: {
        if (targetPage.startsWith('predictions/')) {
          const id = targetPage.split('/')[1];
          if (!id || id === 'heatmap' || id === 'map' || id === 'active') {
            return <PredictionMap navigate={navigate} initialMode={id === 'active' ? 'active' : 'heatmap'} />;
          }
          return <PredictionDetail predictionId={id} navigate={navigate} />;
        }
        if (targetPage.startsWith('complaints/')) {
          const id = targetPage.split('/')[1];
          if (!id || id === 'new' || id.startsWith(':') || id === 'undefined' || id === 'null') {
            return <ComplaintForm navigate={navigate} />;
          }
          return <ComplaintDetail complaintId={id} navigate={navigate} />;
        }
        if (targetPage.startsWith('evidence/')) {
          const complaintId = targetPage.split('/')[1];
          return <EvidenceLocker complaintId={complaintId} navigate={navigate} />;
        }
        return <NotFoundPage navigate={navigate} />;
      }
    }
  };

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        {renderPage()}
      </Suspense>
    </ErrorBoundary>
  );
};

export default React.memo(PageRenderer);
