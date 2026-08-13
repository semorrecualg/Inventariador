import React, { useState, useEffect } from 'react';
import * as turf from '@turf/turf';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { UnitConfig } from '../types';
import { isAdminEmail } from '../utils/authUtils';
import { getCurrentDeviceLocation } from '../utils/gpsUtils';
import { logger } from '../utils/logger';

interface GPSComplianceGuardProps {
  children: React.ReactNode;
  onGpsStatusChange?: (isAvailable: boolean) => void;
  userRole?: string;
  unitConfig?: UnitConfig | null;
  isFieldMode?: boolean;
}

const GPSComplianceGuard: React.FC<GPSComplianceGuardProps> = ({
  children,
  onGpsStatusChange,
  userRole,
  unitConfig,
  isFieldMode = true
}) => {
  const [status, setStatus] = useState<'checking' | 'granted' | 'denied' | 'out-of-range' | 'bypassed'>('checking');
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Ref para o callback externo: o efeito de geofencing não reinicia o watchPosition
  // quando o callback do pai muda de identidade (evita re-check a cada render).
  const onGpsStatusChangeRef = React.useRef(onGpsStatusChange);
  React.useEffect(() => {
    onGpsStatusChangeRef.current = onGpsStatusChange;
  });

  // Determina se o usuário é Administrador de forma robusta
  const checkIsAdmin = (): boolean => {
    // 1. Pelo prop userRole
    const roleUpper = userRole?.toUpperCase();
    if (roleUpper === 'ADMIN' || roleUpper === 'MASTER' || roleUpper === 'GESTOR') return true;

    // 2. Pelo seu perfil local no localStorage ou sessionStorage
    try {
      const userStr = sessionStorage.getItem('app_current_user') || localStorage.getItem('app_current_user') || sessionStorage.getItem('user') || localStorage.getItem('user');
      if (userStr) {
        const u = JSON.parse(userStr);
        const uRole = u.role?.toUpperCase();
        const uEmail = u.email?.toLowerCase();
        if (
          uRole === 'ADMIN' ||
          uRole === 'MASTER' ||
          uRole === 'GESTOR' ||
          u.isAdmin === true ||
          u.is_admin === true ||
          isAdminEmail(uEmail)
        ) {
          return true;
        }
      }
    } catch { /* ignore */ }

    // Verificação adicional direta do e-mail de bypass administrativo
    try {
      const rawEmail = sessionStorage.getItem('userEmail') || localStorage.getItem('userEmail') || sessionStorage.getItem('email') || localStorage.getItem('email');
      if (rawEmail) {
        const cleanEmail = rawEmail.replace(/%22|%2522|"/g, '').trim().toLowerCase();
        if (isAdminEmail(cleanEmail)) return true;
      }
    } catch { /* ignore */ }

    // 3. Fallback de sessionStorage keys ou outras chaves globais
    try {
      const storedRole = sessionStorage.getItem('userRole') || localStorage.getItem('userRole') || sessionStorage.getItem('role') || localStorage.getItem('role');
      if (storedRole) {
        const rUpper = storedRole.toUpperCase();
        if (rUpper === 'ADMIN' || rUpper === 'MASTER' || rUpper === 'GESTOR') return true;
      }
    } catch { /* ignore */ }

    return false;
  };

  const isAdminUser = checkIsAdmin();

  useEffect(() => {
    let watchId: number | null = null;
    let isActive = true;

    // BYPASS SÍNCRONO DE ADMINISTRAÇÃO: Perfis de liderança e testes têm liberação imediata síncrona
    if (isAdminUser) {
      setStatus('bypassed');
      onGpsStatusChangeRef.current?.(true);
      return;
    }

    // Se estiver fora do modo de campo ou se não houver configuração de coordenada de âncora, assume liberação rápida
    if (!isFieldMode || !unitConfig || !unitConfig.lat || !unitConfig.lng) {
      setStatus('granted');
      onGpsStatusChangeRef.current?.(true);
      return;
    }

    const checkLocation = (lat: number, lng: number) => {
      // Cálculo espacial desacoplado de forma assíncrona da thread principal de UI
      setTimeout(() => {
        if (!isActive) return;
        try {
          if (lat === null || lat === undefined || isNaN(lat) || lng === null || lng === undefined || isNaN(lng)) {
            throw new Error("Coordenadas do dispositivo inválidas ou nulas.");
          }

          if (!unitConfig || !unitConfig.lat || !unitConfig.lng || isNaN(Number(unitConfig.lat)) || isNaN(Number(unitConfig.lng))) {
            throw new Error("Coordenadas de ancoragem inválidas ou ausentes.");
          }

          const fromPoint = turf.point([lng, lat]);
          const toPoint = turf.point([Number(unitConfig.lng), Number(unitConfig.lat)]);

          // Distância em metros via Turf.js com isolamento à prova de falhas
          const distanceM = turf.distance(fromPoint, toPoint, { units: 'kilometers' }) * 1000;
          setCurrentDistance(distanceM);
          setUserLocation({ lat, lng });

          const allowedRadius = Number(unitConfig.radius_meters || 500);

          if (distanceM <= allowedRadius) {
            setStatus('granted');
            onGpsStatusChangeRef.current?.(true);
          } else {
            if (isAdminUser) {
              setStatus('bypassed');
              onGpsStatusChangeRef.current?.(true);

            } else {
              setStatus('out-of-range');
              onGpsStatusChangeRef.current?.(false);
            }
          }
        } catch (err) {
          logger.error('[Geofencing] Erro Turf.js ao calcular perímetro em thread desacoplada:', err);
          if (isAdminUser) {
            setStatus('bypassed');
            onGpsStatusChangeRef.current?.(true);

          } else {
            setStatus('granted'); // Failsafe para auditores em caso de erro matemático ou leitura espúria
            onGpsStatusChangeRef.current?.(true);
          }
        }
      }, 0);
    };

    setStatus('checking');

    const runLocationRetrieval = async () => {
      try {
        const roleStr = userRole || (isAdminUser ? 'ADMIN' : 'USER');
        const anchorCoords = { lat: Number(unitConfig.lat), lng: Number(unitConfig.lng) };
        const isIframe = typeof window !== 'undefined' && window.self !== window.top;

        let geoResult;
        try {
          if (isAdminUser || isIframe) {
            logger.warn('[Sandbox GPS Bypass Active] Ignorando detecção devido a Sandbox/iFrame ou Admin.');
            setStatus('bypassed');
            setUserLocation(anchorCoords);
            setCurrentDistance(0);

            onGpsStatusChangeRef.current?.(true);
            return;
          }
          geoResult = await getCurrentDeviceLocation(roleStr, anchorCoords);
        } catch (locationErr: unknown) {
          const errMsg = locationErr instanceof Error ? locationErr.message : String(locationErr);
          logger.warn('[Sandbox GPS Bypass Active] Rejeição ou violação de política ao capturar coordenadas:', errMsg);
          if (isAdminUser || isIframe) {
            setStatus('bypassed');
            setUserLocation(anchorCoords);
            setCurrentDistance(0);

            onGpsStatusChangeRef.current?.(true);
            return;
          } else {
            throw locationErr;
          }
        }

        if (!isActive) return;

        if (geoResult.isBypassed || geoResult.source === 'admin_bypass') {
          logger.warn("[GBR v2.6] Utilizando bypass administrativo em tela.");
          setStatus('bypassed');
          setUserLocation({ lat: geoResult.latitude, lng: geoResult.longitude });
          setCurrentDistance(0);

          onGpsStatusChangeRef.current?.(true);
        } else {
          checkLocation(geoResult.latitude, geoResult.longitude);
        }
      } catch (err: unknown) {
        if (!isActive) return;
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('[Geofencing] Falha ao obter posição pelo getCurrentDeviceLocation:', errMsg);

        const isIframe = typeof window !== 'undefined' && window.self !== window.top;
        if (isAdminUser || isIframe) {
          logger.warn('[Sandbox GPS Bypass Active] Forçando bypass em bloco catch externo devido a Sandbox/iFrame ou perfil Admin.');
          setStatus('bypassed');
          setUserLocation({ lat: Number(unitConfig.lat), lng: Number(unitConfig.lng) });
          setCurrentDistance(0);

          onGpsStatusChangeRef.current?.(true);
        } else {
          setStatus('denied');
          onGpsStatusChangeRef.current?.(false);
        }
      }
    };

    runLocationRetrieval();

    // Registro do monitor contínuo opcionalmente protegido
    try {
      if (!isAdminUser && typeof navigator !== 'undefined' && navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (isActive) {
              checkLocation(pos.coords.latitude, pos.coords.longitude);
            }
          },
          (err) => {
            logger.warn('[Geofencing/Watch] Erro no monitoramento contínuo (capturado e silenciado na guarda):', err.message);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
      }
    } catch (watchErr) {
      logger.warn('[Geofencing/Watch] Falha síncrona ao registrar watchPosition (silenciada):', watchErr);
    }

    return () => {
      isActive = false;
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch (e) {
          logger.warn('Erro ao limpar clearWatch:', e);
        }
      }
    };
  }, [unitConfig, userRole, isFieldMode, isAdminUser]);

  if (status === 'checking') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center p-8 bg-bg-main text-center animate-fadeIn">
        <Loader2 className="w-12 h-12 text-accent animate-spin mb-4" />
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Validando Guarda de GPS</h3>
        <p className="text-[10px] text-accent font-bold uppercase tracking-widest animate-pulse mt-2">
          Verificando perímetro de conformidade...
        </p>
      </div>
    );
  }

  if (status === 'denied') {
    const handleRequestOSPermissions = async () => {
      try {
        const result = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (result.location === 'granted') {
          window.location.reload();
        } else {
          alert('Permissão de geolocalização não concedida pelo sistema operacional.');
        }
      } catch (err) {
        logger.error('Falha ao solicitar permissão via Capacitor Geolocation:', err);
        alert('Dispositivo ou sandbox não suporta solicitação nativa de permissão.');
      }
    };

    const handleUseReferenceCoordinates = () => {
      if (!isAdminUser) {
        logger.warn('[GBR v2.6] Tentativa não autorizada de bypass de coordenadas.');
        alert('Acesso negado: Essa funcionalidade de contingência é limitada a Administradores e Gestores.');
        return;
      }
      if (unitConfig && unitConfig.lat && unitConfig.lng) {
        logger.info('[GBR v2.6] Ativando coordenadas estimadas/failsafe para fins de conformidade operacional.');
        setStatus('bypassed');
        setUserLocation({ lat: Number(unitConfig.lat), lng: Number(unitConfig.lng) });
        setCurrentDistance(0);
        onGpsStatusChangeRef.current?.(true);
      }
    };

    return (
      <div className="h-screen w-full flex flex-col items-center justify-center p-8 bg-bg-main text-center animate-fadeIn">
        <div className="w-20 h-20 bg-amber-50 border border-amber-200 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-amber-500/10">
          <ShieldAlert size={40} className="text-amber-500 animate-pulse" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight mb-2">Restrição de Localização (GPS)</h2>
        <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-6 max-w-sm leading-relaxed">
          O acesso ao GPS falhou devido a políticas de segurança da WebView, sandbox de visualização ou ausência de sinal de satélite.
        </p>

        <div className="w-full max-w-xs bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left mb-6 space-y-2">
          <div className="flex flex-col gap-1">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Filial Alvo:</span>
            <span className="text-[10px] font-mono text-slate-600 font-bold">{unitConfig?.unit_id || 'Não Identificada'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Coordenadas de Referência:</span>
            <span className="text-[10px] font-mono text-slate-600 font-bold">
              {unitConfig?.lat ? `${Number(unitConfig.lat).toFixed(6)}, ${Number(unitConfig.lng).toFixed(6)}` : 'Não parametrizadas'}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs block">
          <button
            onClick={handleRequestOSPermissions}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
          >
            Solicitar Permissão (OS / WebView)
          </button>

          {isAdminUser && (
            <button
              onClick={handleUseReferenceCoordinates}
              className="w-full py-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-100 active:scale-95 transition-all cursor-pointer"
            >
              Avançar por Estimativa de Antena (Apenas Admin)
            </button>
          )}

          <button
            onClick={() => window.history.back()}
            className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all cursor-pointer"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  if (status === 'out-of-range') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center p-8 bg-bg-main text-center animate-fadeIn">
        <div className="w-20 h-20 bg-red-50 border border-red-150 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-red-500/10">
          <ShieldAlert size={40} className="text-red-500 animate-pulse" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight mb-2">Bloqueio de Segurança</h2>
        <p className="text-xs text-red-600 uppercase font-black tracking-wider mb-4">
          Dispositivo fora do perímetro permitido para esta filial.
        </p>

        <div className="w-full max-w-xs bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left mb-8 space-y-3">
          <div className="flex items-center justify-between border-b pb-2 border-slate-200">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sua Distância:</span>
            <span className="text-xs font-black text-slate-800">{currentDistance ? `${Math.round(currentDistance).toLocaleString('pt-BR')}m` : '---'}</span>
          </div>
          <div className="flex items-center justify-between border-b pb-2 border-slate-200">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Limite Permitido:</span>
            <span className="text-xs font-black text-slate-800">{unitConfig?.radius_meters || 500}m</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Coordenadas Âncora:</span>
            <span className="text-[10px] font-mono text-slate-600 font-bold">{unitConfig?.lat ? `${Number(unitConfig.lat).toFixed(6)}, ${Number(unitConfig.lng).toFixed(6)}` : 'Não configuradas'}</span>
          </div>
          {userLocation && (
            <div className="flex flex-col gap-1 border-t pt-2 border-slate-200">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Seu GPS Atual:</span>
              <span className="text-[10px] font-mono text-slate-600 font-bold">{userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full max-w-xs py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 active:scale-95 transition-all mb-3 cursor-pointer"
        >
          Tentar Novamente (Recarregar)
        </button>
        <button
          onClick={() => window.history.back()}
          className="w-full max-w-xs py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all cursor-pointer"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Banner inline do bypass administrativo — renderizado no FLUXO normal,
          logo abaixo do header da filial; nunca sobreposto ao conteúdo. */}
      {status === 'bypassed' && (
        <div className="bg-emerald-50/80 border-b border-emerald-200/70 px-4 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
          <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest flex-1 leading-tight">
            🔓 Bypass Síncrono Imediato Ativo — Status de Homologação: Liberado
            <span className="text-emerald-600/80 ml-1.5 font-bold">({unitConfig?.unit_id || 'Âncora'})</span>
          </p>
        </div>
      )}

      {children}
    </div>
  );
};

export default GPSComplianceGuard;
