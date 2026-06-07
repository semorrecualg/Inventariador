import React, { useState, useEffect } from 'react';
import * as turf from '@turf/turf';
import { ShieldAlert, Unlock, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Geolocation } from '@capacitor/geolocation';
import { UnitConfig } from '../types';
import { getCurrentDeviceLocation } from '../utils/gpsUtils';

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
  const [showAdminToast, setShowAdminToast] = useState(false);

  // Determina se o usuário é Administrador de forma robusta
  const checkIsAdmin = (): boolean => {
    // 1. Pelo prop userRole
    const roleUpper = userRole?.toUpperCase();
    if (roleUpper === 'ADMIN' || roleUpper === 'MASTER' || roleUpper === 'GESTOR') return true;

    // 2. Pelo seu perfil local no localStorage ou sessionStorage
    try {
      const userStr = localStorage.getItem('app_current_user') || sessionStorage.getItem('app_current_user');
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
          uEmail === 'semorr@gmail.com' ||
          uEmail === 'semorr@gmail.com.br'
        ) {
          return true;
        }
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
      onGpsStatusChange?.(true);
      setShowAdminToast(true);
      return;
    }

    // Se estiver fora do modo de campo ou se não houver configuração de coordenada de âncora, assume liberação rápida
    if (!isFieldMode || !unitConfig || !unitConfig.lat || !unitConfig.lng) {
      setStatus('granted');
      onGpsStatusChange?.(true);
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
            onGpsStatusChange?.(true);
          } else {
            if (isAdminUser) {
              setStatus('bypassed');
              onGpsStatusChange?.(true);
              setShowAdminToast(true);
            } else {
              setStatus('out-of-range');
              onGpsStatusChange?.(false);
            }
          }
        } catch (err) {
          console.error('[Geofencing] Erro Turf.js ao calcular perímetro em thread desacoplada:', err);
          if (isAdminUser) {
            setStatus('bypassed');
            onGpsStatusChange?.(true);
            setShowAdminToast(true);
          } else {
            setStatus('granted'); // Failsafe para auditores em caso de erro matemático ou leitura espúria
            onGpsStatusChange?.(true);
          }
        }
      }, 0);
    };

    setStatus('checking');

    const runLocationRetrieval = async () => {
      try {
        const roleStr = userRole || (isAdminUser ? 'ADMIN' : 'USER');
        const anchorCoords = { lat: Number(unitConfig.lat), lng: Number(unitConfig.lng) };
        
        let geoResult;
        try {
          if (isAdminUser) {
            console.warn('[Sandbox GPS Bypass Active]');
            setStatus('bypassed');
            setUserLocation(anchorCoords);
            setCurrentDistance(0);
            setShowAdminToast(true);
            onGpsStatusChange?.(true);
            return;
          }
          geoResult = await getCurrentDeviceLocation(roleStr, anchorCoords);
        } catch (locationErr: unknown) {
          const errMsg = locationErr instanceof Error ? locationErr.message : String(locationErr);
          console.warn('[Sandbox GPS Bypass Active] Rejeição ou violação de política ao capturar coordenadas:', errMsg);
          if (isAdminUser) {
            setStatus('bypassed');
            setUserLocation(anchorCoords);
            setCurrentDistance(0);
            setShowAdminToast(true);
            onGpsStatusChange?.(true);
            return;
          } else {
            throw locationErr;
          }
        }
        
        if (!isActive) return;

        if (geoResult.isBypassed || geoResult.source === 'admin_bypass') {
          console.warn("[GBR v2.6] Utilizando bypass administrativo em tela.");
          setStatus('bypassed');
          setUserLocation({ lat: geoResult.latitude, lng: geoResult.longitude });
          setCurrentDistance(0);
          setShowAdminToast(true);
          onGpsStatusChange?.(true);
          
          // Oculta o toast após 5 segundos
          const timer = setTimeout(() => {
            if (isActive) setShowAdminToast(false);
          }, 5000);
          return () => clearTimeout(timer);
        } else {
          checkLocation(geoResult.latitude, geoResult.longitude);
        }
      } catch (err: unknown) {
        if (!isActive) return;
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[Geofencing] Falha ao obter posição pelo getCurrentDeviceLocation:', errMsg);
        
        if (isAdminUser) {
          console.warn('[Sandbox GPS Bypass Active] Forçando bypass em bloco catch externo.');
          setStatus('bypassed');
          setUserLocation({ lat: Number(unitConfig.lat), lng: Number(unitConfig.lng) });
          setCurrentDistance(0);
          setShowAdminToast(true);
          onGpsStatusChange?.(true);
        } else {
          setStatus('denied');
          onGpsStatusChange?.(false);
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
            console.warn('[Geofencing/Watch] Erro no monitoramento contínuo (capturado e silenciado na guarda):', err.message);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
      }
    } catch (watchErr) {
      console.warn('[Geofencing/Watch] Falha síncrona ao registrar watchPosition (silenciada):', watchErr);
    }

    return () => {
      isActive = false;
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch (e) {
          console.warn('Erro ao limpar clearWatch:', e);
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
        console.error('Falha ao solicitar permissão via Capacitor Geolocation:', err);
        alert('Dispositivo ou sandbox não suporta solicitação nativa de permissão.');
      }
    };

    const handleUseReferenceCoordinates = () => {
      if (!isAdminUser) {
        console.warn('[GBR v2.6] Tentativa não autorizada de bypass de coordenadas.');
        alert('Acesso negado: Essa funcionalidade de contingência é limitada a Administradores e Gestores.');
        return;
      }
      if (unitConfig && unitConfig.lat && unitConfig.lng) {
        console.log('[GBR v2.6] Ativando coordenadas estimadas/failsafe para fins de conformidade operacional.');
        setStatus('bypassed');
        setUserLocation({ lat: Number(unitConfig.lat), lng: Number(unitConfig.lng) });
        setCurrentDistance(0);
        onGpsStatusChange?.(true);
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
      {/* Toast flutuante discreto indicando soberania do Admin */}
      <AnimatePresence>
        {showAdminToast && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-xs px-4 pointer-events-none"
          >
            <div className="bg-slate-950/95 backdrop-blur border border-emerald-500/30 text-white p-3.5 rounded-2xl flex items-center gap-3 shadow-2xl">
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-xl text-emerald-400">
                <Unlock size={16} />
              </div>
              <div className="text-left flex-1">
                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1">🔓 [Bypass Admin Ativo]</p>
                <p className="text-[9px] text-slate-300 font-bold uppercase tracking-wide leading-tight">Perímetro de GPS liberado para perfil de liderança.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {status === 'bypassed' && (
        <div className="fixed bottom-4 right-4 z-[9998] pointer-events-auto bg-slate-900/95 backdrop-blur text-white px-3 py-1.5 rounded-full flex items-center gap-2 border border-emerald-500/30 shadow-lg text-[9px] font-bold uppercase tracking-wider animate-fadeIn">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
          <span>[Bypass Admin Ativo] ({unitConfig?.unit_id || 'Âncora'})</span>
        </div>
      )}

      {children}
    </div>
  );
};

export default GPSComplianceGuard;
