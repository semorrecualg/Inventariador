import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, Loader2, Lock, ShieldCheck } from 'lucide-react';

interface BiometricUnlockProps {
  /** Último utilizador autenticado neste aparelho (chave da credencial). */
  username: string;
  /** Verifica a biometria e devolve se o prompt foi confirmado. */
  authenticate: (username: string) => Promise<boolean>;
  /** Prompt confirmado: a sessão local é concluída pelo `Login`. */
  onUnlocked: () => void | Promise<void>;
  /** Saída explícita para a senha — o plano B nunca desaparece. */
  onUsePassword: () => void;
}

/**
 * DESBLOQUEIO BIOMÉTRICO (primeira etapa no mobile)
 *
 * Abre com o último utilizador do aparelho e dispara o prompt do sistema uma
 * única vez, sem teclado. Recusa/cancelamento não prendem: a tela oferece
 * «Tentar novamente» e «Usar senha». Só é montada no casco nativo, quando a
 * política (`canOfferBiometricUnlock`) confirmou capacidade + credencial — no
 * web sem autenticador o acesso continua a ser utilizador + senha.
 */
export const BiometricUnlock: React.FC<BiometricUnlockProps> = ({
  username,
  authenticate,
  onUnlocked,
  onUsePassword
}) => {
  const [status, setStatus] = useState<'prompting' | 'failed' | 'unlocked'>('prompting');
  // O prompt é automático, mas só uma vez: rerenders e o botão de repetir não
  // devem disparar prompts em loop.
  const autoPrompted = useRef(false);

  const runPrompt = useCallback(async () => {
    setStatus('prompting');
    let confirmed = false;
    try {
      confirmed = await authenticate(username);
    } catch (err) {
      console.error('[BiometricUnlock] Falha ao pedir a biometria:', err);
      confirmed = false;
    }

    if (confirmed) {
      setStatus('unlocked');
      await onUnlocked();
      return;
    }
    setStatus('failed');
  }, [authenticate, onUnlocked, username]);

  useEffect(() => {
    if (autoPrompted.current) return;
    autoPrompted.current = true;
    void runPrompt();
  }, [runPrompt]);

  const prompting = status === 'prompting';
  const unlocked = status === 'unlocked';

  return (
    <div
      className="w-full min-h-screen bg-white text-slate-900 flex flex-col items-center justify-center px-6 pb-safe pt-safe"
      data-testid="biometric-unlock"
    >
      <div className="w-24 h-24 bg-white border border-slate-100 rounded-full flex items-center justify-center shadow-md ring-4 ring-white mb-6">
        {unlocked ? (
          <ShieldCheck size={44} className="text-emerald-500" />
        ) : (
          <Fingerprint
            size={44}
            className={prompting ? 'text-accent animate-pulse' : 'text-slate-400'}
          />
        )}
      </div>

      <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">
        Desbloqueio biométrico
      </p>
      <h1
        className="text-lg font-black text-slate-900 uppercase tracking-[0.12em] text-center break-all mb-4"
        data-testid="biometric-unlock-user"
      >
        {username}
      </h1>

      <div className="h-10 flex items-center justify-center mb-6">
        {prompting && (
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-accent" />
            Confirme a sua biometria
          </p>
        )}
        {unlocked && (
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
            Biometria confirmada
          </p>
        )}
        {status === 'failed' && (
          <p
            className="text-[10px] font-bold text-amber-600 uppercase tracking-widest text-center px-2"
            data-testid="biometric-unlock-status"
          >
            Biometria não confirmada
          </p>
        )}
      </div>

      <div className="w-full max-w-sm space-y-2.5">
        {status === 'failed' && (
          <button
            type="button"
            onClick={() => void runPrompt()}
            data-testid="biometric-unlock-retry"
            className="w-full bg-accent text-white font-extrabold py-4 rounded-2xl shadow-md active:scale-[0.98] transition-all uppercase tracking-[0.15em] text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <Fingerprint size={18} />
            <span>Tentar novamente</span>
          </button>
        )}

        <button
          type="button"
          onClick={onUsePassword}
          data-testid="biometric-unlock-password"
          className="w-full bg-white border-2 border-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl shadow-sm active:scale-[0.98] transition-all uppercase tracking-[0.12em] text-[11px] flex items-center justify-center gap-2 cursor-pointer"
        >
          <Lock size={16} />
          <span>Usar senha</span>
        </button>

        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center pt-2">
          A senha continua a ser a alternativa neste aparelho
        </p>
      </div>
    </div>
  );
};

export default BiometricUnlock;
