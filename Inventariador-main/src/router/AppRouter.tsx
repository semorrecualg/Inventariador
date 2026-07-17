import React, { Suspense, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { screenToPath } from './routes';
import { useUiStore } from '../stores/uiStore';
import { AppScreen, NavigationParams } from '../types';
import { Loader2 } from 'lucide-react';

/**
 * Full-screen loading spinner shown while a lazy-loaded route is loading.
 */
function RouteLoadingFallback() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-bg-main">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 text-accent animate-spin" />
        <p className="text-sm text-ink-muted">Carregando...</p>
      </div>
    </div>
  );
}

/**
 * Internal component that bridges the legacy window.pushScreen API to React Router.
 * Must be rendered inside <HashRouter>.
 */
function NavigationBridgeEffect() {
  const navigate = useNavigate();
  const setScreen = useUiStore((s) => s.setScreen);
  const setScreenParams = useUiStore((s) => s.setScreenParams);
  const setHistory = useUiStore((s) => s.setHistory);

  useEffect(() => {
    window.pushScreen = (screen: AppScreen, params?: NavigationParams) => {
      setScreen(screen);
      setScreenParams(params || null);

      const existing = (() => {
        try {
          const raw = localStorage.getItem('gbr_kardek_history');
          return raw ? JSON.parse(raw) : [AppScreen.LOGIN];
        } catch {
          return [AppScreen.LOGIN];
        }
      })();
      const newHistory =
        screen === AppScreen.LOGIN || screen === AppScreen.MAIN_MENU
          ? [screen]
          : [...existing, screen];
      setHistory(newHistory);

      const path = screenToPath[screen] || '/login';
      navigate(path);
    };

    window.setShowErrorModal = (show: boolean) => {
      const store = useUiStore.getState();
      store.setModalConfig({ ...store.modalConfig, isOpen: show });
    };

    return () => {
      delete window.pushScreen;
      delete window.setShowErrorModal;
    };
  }, [navigate, setScreen, setScreenParams, setHistory]);

  return null;
}

/**
 * The main application router.
 * Uses HashRouter for Capacitor (file://) compatibility.
 * Renders the App component inside the Router context so it can use <Routes>.
 * Bridges legacy pushScreen → React Router navigate.
 */
const AppRouter: React.FC = () => {
  const AppLazy = React.lazy(() => import('../App'));

  return (
    <>
      <NavigationBridgeEffect />
      <Suspense fallback={<RouteLoadingFallback />}>
        <AppLazy />
      </Suspense>
    </>
  );
};

export default AppRouter;
