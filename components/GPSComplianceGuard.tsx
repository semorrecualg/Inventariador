
import React, { useState, useEffect } from 'react';
import { ShieldAlert, MapPin, RefreshCw, Info } from 'lucide-react';

interface GPSComplianceGuardProps {
  children: React.ReactNode;
  onGpsStatusChange?: (isAvailable: boolean) => void;
}

const GPSComplianceGuard: React.FC<GPSComplianceGuardProps> = ({ children, onGpsStatusChange }) => {
  const [status, setStatus] = useState<'checking' | 'granted' | 'denied' | 'unavailable'>('checking');
  const [error, setError] = useState<string | null>(null);

  const checkGPS = async () => {
    setStatus('checking');
    setError(null);

    if (!navigator.geolocation) {
      setStatus('unavailable');
      setError('Hardware de GPS não detectado ou não suportado pelo navegador.');
      onGpsStatusChange?.(false);
      return;
    }

    // Tenta obter a posição para forçar o prompt do sistema ou verificar se está ativo
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('GPS Compliance Verified:', position.coords.latitude, position.coords.longitude);
        setStatus('granted');
        onGpsStatusChange?.(true);
      },
      (err) => {
        console.error('GPS Error:', err);
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Permissão de Geolocalização negada pelo usuário ou bloqueada pelo sistema.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus('unavailable');
          setError('Sinal de GPS indisponível ou desativado nas configurações do dispositivo.');
        } else {
          setStatus('unavailable');
          setError('Erro ao acessar o GPS: ' + err.message);
        }
        onGpsStatusChange?.(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    checkGPS();
  }, []);

  if (status === 'granted') {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[30000] bg-slate-900 flex flex-col items-center justify-center p-8 text-center animate-fadeIn">
      <div className="w-24 h-24 bg-red-500/10 rounded-[2rem] flex items-center justify-center mb-8 relative">
        <div className="absolute inset-0 bg-red-500/20 rounded-[2rem] animate-ping" />
        <ShieldAlert size={48} className="text-red-500 relative z-10" />
      </div>

      <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">
        Bloqueio de Conformidade
      </h2>
      
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-8 max-w-sm">
        <div className="flex items-center space-x-3 text-amber-400 mb-3 justify-center">
          <MapPin size={18} />
          <span className="text-[10px] font-bold uppercase tracking-widest">GPS Obrigatório</span>
        </div>
        <p className="text-slate-400 text-xs leading-relaxed">
          {error || 'Para garantir a integridade da auditoria e o rastreio de ativos, o uso do GPS é obrigatório neste módulo.'}
        </p>
      </div>

      <div className="space-y-4 w-full max-w-xs">
        <button
          onClick={checkGPS}
          className="w-full py-5 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center space-x-3"
        >
          <RefreshCw size={16} className={status === 'checking' ? 'animate-spin' : ''} />
          <span>{status === 'checking' ? 'Verificando...' : 'Tentar Reativar'}</span>
        </button>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-start space-x-3 text-left">
          <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Como Habilitar:</p>
            <p className="text-[9px] text-slate-400 leading-tight">
              1. Vá em <strong>Configurações</strong> do Celular.<br/>
              2. <strong>Privacidade</strong> {'>'} <strong>Localização</strong>.<br/>
              3. Ative o GPS e permita o acesso para este navegador.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-12 text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em]">
        Protocolo GBR v24.50 • Segurança de Auditoria
      </p>
    </div>
  );
};

export default GPSComplianceGuard;
