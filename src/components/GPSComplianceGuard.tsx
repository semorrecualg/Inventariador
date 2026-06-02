import React, { useState, useEffect } from 'react';
import * as turf from '@turf/turf';
import { ShieldAlert, Unlock, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UnitConfig } from '../types';

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

    if (isAdminUser) {
      setStatus('bypassed');
      // Mostra o toast informativo para o Admin por 5 segundos
      setShowAdminToast(true);
      const timer = setTimeout(() => setShowAdminToast(false), 5000);
      onGpsStatusChange?.(true);
      return () => clearTimeout(timer);
    }

    // Se estiver fora do modo de campo ou se não houver configuração de coordenada de âncora, assume liberação
    if (!isFieldMode || !unitConfig || !unitConfig.lat || !unitConfig.lng) {
      setStatus('granted');
      onGpsStatusChange?.(true);
      return;
    }

    const checkLocation = (lat: number, lng: number) => {
      try {
        const fromPoint = turf.point([lng, lat]);
        const toPoint = turf.point([Number(unitConfig.lng), Number(unitConfig.lat)]);
        
        // Distância em metros via Turf.js
        const distanceM = turf.distance(fromPoint, toPoint, { units: 'kilometers' }) * 1000;
        setCurrentDistance(distanceM);
        setUserLocation({ lat, lng });

        const allowedRadius = Number(unitConfig.radius_meters || 500);

        if (distanceM <= allowedRadius) {
          setStatus('granted');
          onGpsStatusChange?.(true);
        } else {
          setStatus('out-of-range');
          onGpsStatusChange?.(false);
        }
      } catch (err) {
        console.error('[Geofencing] Erro Turf.js ao calcular perímetro:', err);
        setStatus('granted'); // Failsafe para não travar em caso de erro matemático
      }
    };

    if (!navigator.geolocation) {
      setStatus('denied');
      onGpsStatusChange?.(false);
      return;
    }

    setStatus('checking');

    // Primeira tentativa rápida
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        checkLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        console.warn('[Geofencing] Falha ao obter posição:', err);
        setStatus('denied');
        onGpsStatusChange?.(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
    );

    // Registro do monitor contínuo
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        checkLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        console.warn('[Geofencing/Watch] Erro no monitoramento contínuo:', err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [unitConfig, userRole, isFieldMode]);

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
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center p-8 bg-bg-main text-center animate-fadeIn">
        <div className="w-20 h-20 bg-red-50 border border-red-150 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-red-500/10">
          <ShieldAlert size={40} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight mb-2">GPS Desativado</h2>
        <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-8 max-w-xs leading-relaxed">
          O aplicativo GBR requer acesso ao GPS para auditoria de campo. Por favor, habilite a localização nas configurações do seu navegador ou dispositivo.
        </p>
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
                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1">🔓 Soberania Admin</p>
                <p className="text-[9px] text-slate-300 font-bold uppercase tracking-wide leading-tight">Perímetro de GPS ignorado para testes/auditoria.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </div>
  );
};

export default GPSComplianceGuard;
