import React, { Suspense, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { screenToPath } from './routes';
import { useUiStore } from '../stores/uiStore';
import { AppScreen, NavigationParams } from '../types';
import { Loader2 } from 'lucide-react';
import AppVersionStamp from '../components/AppVersionStamp';
import { logger } from '../utils/logger';
import { carregarComRetry, recarregarBootstrapUmaVez } from '../utils/bootArranque';

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
 * O `App` é carregado uma única vez, no escopo do módulo.
 *
 * Antes o `React.lazy` era criado DENTRO do componente: cada render produzia um
 * tipo novo, o React desmontava e remontava o `App` inteiro (re-executando o
 * boot e a história de navegação) e uma falha transitória de rede no primeiro
 * pedido não tinha segunda oportunidade — o F5 aterrava no ErrorBoundary.
 */
const carregarApp = () =>
  carregarComRetry(() => import('../App'), {
    tentativas: 3,
    esperaMs: 300,
    aoFalhar: (erro, tentativa) =>
      logger.warn(`>>> [BOOT] Falha ao carregar o módulo do app (tentativa ${tentativa}).`, erro),
  });

const AppLazy = React.lazy(carregarApp);

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
  // O Vite avisa por este evento quando um módulo pré-carregado não chega
  // (redeploy, proxy a devolver 503). Sem o handler, a rejeição sobe ao
  // ErrorBoundary e o utilizador fica preso no cartão de erro; com ele,
  // recarregamos UMA vez (guarda contra ciclos em `bootArranque`).
  useEffect(() => {
    const aoFalharPreload = (evento: Event) => {
      evento.preventDefault();
      logger.warn('>>> [BOOT] Módulo pré-carregado falhou (vite:preloadError).');
      recarregarBootstrapUmaVez();
    };
    window.addEventListener('vite:preloadError', aoFalharPreload);
    return () => window.removeEventListener('vite:preloadError', aoFalharPreload);
  }, []);

  return (
    <>
      <NavigationBridgeEffect />
      <Suspense fallback={<RouteLoadingFallback />}>
        <AppLazy />
      </Suspense>
      {/* Versionador: um selo só, igual em todas as telas, lido do package.json. */}
      <AppVersionStamp />
    </>
  );
};

export default AppRouter;
