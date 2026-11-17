import React, { useState, useEffect } from 'react';
import { Fingerprint, ShieldCheck, CheckCircle2, AlertCircle, Loader2, Camera, UserCheck, ShieldAlert } from 'lucide-react';
import { registerBiometric, isBiometricSupported } from '../services/biometricService';
import { biometricReasonText, type BiometricReason } from '../utils/biometricPolicy';
import { motion } from 'motion/react';

export type BiometricScreenMode = 'required' | 'fallback';

interface BiometricRegistrationProps {
  username: string;
  /** `required`: aparelho capaz, cadastro obrigatório. `fallback`: aparelho incapaz. */
  mode?: BiometricScreenMode;
  /** Motivo decidido pela política (`resolveBiometricStep`) — vai para a tela. */
  reason?: BiometricReason;
  onComplete: () => void;
  /** Dispensa explícita do fallback (registada na auditoria pelo App). */
  onSkip?: () => void;
}

const DEFAULT_FALLBACK_REASON: BiometricReason = 'device-without-authenticator';

const BiometricRegistration: React.FC<BiometricRegistrationProps> = ({
  username,
  mode = 'required',
  reason,
  onComplete,
  onSkip,
}) => {
  const [status, setStatus] = useState<'idle' | 'registering' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    isBiometricSupported().then(setSupported);
  }, []);

  const handleRegister = async () => {
    try {
      setStatus('registering');
      setErrorMessage(null);
      
      const success = await registerBiometric(username.toLowerCase().trim());
      
      if (success) {
        setStatus('success');
        setTimeout(() => {
          onComplete();
        }, 2000);
      } else {
        throw new Error("Não foi possível completar o registro biométrico.");
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Erro no registro biométrico:', error);
      setStatus('error');
      setErrorMessage(error.message || "Erro ao registrar biometria. Tente novamente.");
    }
  };

  // Fase 2: a dispensa só existe onde o aparelho NÃO pode verificar a biometria
  // (WebView do app nativo / hardware sem autenticador). Se o suporte cair
  // depois da decisão, a tela degrada para o fallback em vez de prender o
  // utilizador ou de fingir um cadastro impossível.
  const fallbackMode = mode === 'fallback' || supported === false;
  const fallbackReason = reason ?? DEFAULT_FALLBACK_REASON;
  const handleFallback = () => {
    if (onSkip) {
      onSkip();
      return;
    }
    onComplete();
  };

  if (fallbackMode) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center bg-bg-main">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
          <ShieldAlert size={40} className="text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-ink mb-2 uppercase tracking-tight">Biometria indisponível</h2>
        <p className="text-sm text-ink-muted mb-4 max-w-xs leading-relaxed">
          {biometricReasonText(fallbackReason)}
        </p>
        <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-8 max-w-xs leading-tight">
          A dispensa vale para esta sessão e fica registada na auditoria.
        </p>
        <button
          onClick={handleFallback}
          className="w-full py-4 bg-accent text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg active:scale-95 transition-all"
        >
          Continuar sem biometria neste aparelho
        </button>
      </div>
    );
  }

  if (supported === null) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center bg-bg-main">
        <Loader2 size={40} className="text-accent animate-spin mb-6" />
        <p className="text-xs font-bold text-ink-muted uppercase tracking-widest">A verificar segurança do aparelho...</p>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col bg-bg-main overflow-y-auto no-scrollbar">
      <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative mb-8"
        >
          <div className="w-32 h-32 bg-accent/10 rounded-full flex items-center justify-center">
            {status === 'success' ? (
              <CheckCircle2 size={64} className="text-green-500 animate-bounce" />
            ) : status === 'registering' ? (
              <Loader2 size={64} className="text-accent animate-spin" />
            ) : (
              <div className="relative">
                <Camera size={64} className="text-accent" />
                <div className="absolute -bottom-2 -right-2 bg-white p-1.5 rounded-full shadow-md border border-accent/20">
                  <Fingerprint size={24} className="text-accent" />
                </div>
              </div>
            )}
          </div>
          
          {status === 'idle' && (
            <motion.div 
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute inset-0 border-4 border-accent/20 rounded-full"
            />
          )}
        </motion.div>

        <h2 className="text-2xl font-black text-ink mb-3 uppercase tracking-tighter italic">
          {status === 'success' ? 'REGISTRO CONCLUÍDO!' : 'SEGURANÇA BIOMÉTRICA'}
        </h2>
        
        <p className="text-sm text-ink-muted mb-4 max-w-xs leading-relaxed">
          {status === 'success' 
            ? 'Sua biometria foi cadastrada com sucesso. Agora você pode acessar o sistema com apenas um toque ou reconhecimento facial.'
            : 'Para sua segurança e agilidade, cadastre sua biometria (Digital ou FACE). Recomendamos priorizar a FACE para evitar problemas com digitais sujas durante o inventário.'}
        </p>

        {status === 'idle' && (
          <p className="text-[11px] font-bold text-accent uppercase tracking-wider mb-6 max-w-xs leading-tight">
            Cadastro obrigatório neste aparelho — o acesso só avança com a biometria registada.
          </p>
        )}

        {status === 'error' && (
          <div className="mb-6 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-left">
            <AlertCircle size={20} className="text-red-500 shrink-0" />
            <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider leading-tight">
              {errorMessage}
            </p>
          </div>
        )}

        {status === 'idle' && (
          <div className="w-full space-y-4">
            <button 
              onClick={handleRegister}
              className="w-full py-4 bg-accent text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              <UserCheck size={20} />
              Cadastrar Biometria
            </button>
          </div>
        )}

        {status === 'registering' && (
          <p className="text-xs font-bold text-accent uppercase tracking-widest animate-pulse">
            Siga as instruções do seu dispositivo...
          </p>
        )}
      </div>

      <div className="mt-auto pt-6 border-t border-border flex items-center justify-center gap-2 text-ink-muted opacity-50">
        <ShieldCheck size={14} />
        <span className="text-[10px] font-bold uppercase tracking-widest">Proteção de Dados GBR</span>
      </div>
    </div>
  );
};

export default BiometricRegistration;
