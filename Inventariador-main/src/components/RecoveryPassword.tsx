import React, { useState } from 'react';
import { ShieldCheck, Lock, Eye, EyeOff, Loader2, AlertCircle, KeyRound } from 'lucide-react';
import { supabase } from '../services/supabaseService';
import { logger } from '../utils/logger';

interface RecoveryPasswordProps {
  /** Senha definida com sucesso (o App volta ao login). */
  onDone: () => void;
  /** Desistir: o link deixa de valer nesta sessão. */
  onCancel: () => void;
}

/**
 * Ecrã do link de recuperação do Supabase.
 *
 * O link (`#access_token=…&type=recovery`) abre uma sessão temporária: aqui ela
 * só serve para `auth.updateUser({ password })`. Terminada a troca, a sessão é
 * encerrada de propósito — quem redefine a senha tem de entrar com ela, para
 * provar que a sabe.
 */
const RecoveryPassword: React.FC<RecoveryPasswordProps> = ({ onDone, onCancel }) => {
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (novaSenha.length < 8) {
      setErro('A nova senha precisa de pelo menos 8 caracteres.');
      return;
    }
    if (novaSenha !== confirmacao) {
      setErro('As senhas não coincidem.');
      return;
    }
    if (!supabase) {
      setErro('Este build não tem ligação ao Supabase: não é possível definir a senha aqui.');
      return;
    }

    setAGravar(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        setErro('O link de recuperação já não é válido (expirado ou já usado). Peça um novo e-mail em "Esqueci a senha".');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;

      logger.info('[Recuperação] Senha redefinida pelo link de recuperação.');
      // Sessão temporária do link: sai para o login provar a nova senha.
      await supabase.auth.signOut();
      onDone();
    } catch (err) {
      // Erros do supabase-js são objectos simples com `message`, não `Error`.
      const detalhe = err instanceof Error
        ? err.message
        : (err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err));
      logger.warn('[Recuperação] Falha ao definir a nova senha:', detalhe);
      setErro(`Não foi possível definir a nova senha: ${detalhe}`);
    } finally {
      setAGravar(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10002] bg-white overflow-y-auto animate-fadeIn">
      <div className="min-h-full flex flex-col justify-center px-6 py-10 max-w-sm mx-auto w-full">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 mx-auto mb-6 shadow-sm border border-emerald-100">
            <ShieldCheck size={40} />
          </div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Definir Nova Senha</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-3 leading-relaxed">
            Link de recuperação confirmado. <br />
            Escolha a senha que vai usar a partir de agora.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-[10px] font-black uppercase flex items-center tracking-widest shadow-md">
              <AlertCircle size={16} className="mr-3 shrink-0" />
              <span className="flex-1">{erro}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nova Senha</label>
            <div className="relative group">
              <input
                type={mostrar ? 'text' : 'password'}
                required
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full pl-11 pr-12 py-3.5 rounded-2xl border border-slate-200 bg-white outline-none transition-all text-slate-900 font-bold shadow-sm hover:shadow-md text-sm focus:ring-2 focus:ring-accent/10"
              />
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <button
                type="button"
                onClick={() => setMostrar(!mostrar)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-slate-300 hover:text-accent transition-colors"
              >
                {mostrar ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Repetir Senha</label>
            <div className="relative group">
              <input
                type={mostrar ? 'text' : 'password'}
                required
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white outline-none transition-all text-slate-900 font-bold shadow-sm hover:shadow-md text-sm focus:ring-2 focus:ring-accent/10"
              />
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            </div>
          </div>

          <button
            type="submit"
            disabled={aGravar}
            className="w-full bg-accent text-white font-extrabold py-4 rounded-2xl shadow-md hover:shadow-lg hover:brightness-105 active:scale-[0.98] transition-all mt-4 uppercase tracking-[0.15em] text-xs flex items-center justify-center space-x-2 disabled:opacity-70 cursor-pointer"
          >
            {aGravar ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>A guardar...</span>
              </>
            ) : (
              <span>Guardar Nova Senha</span>
            )}
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={aGravar}
            className="w-full text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-accent transition-colors py-2 cursor-pointer"
          >
            Voltar ao login
          </button>
        </form>
      </div>
    </div>
  );
};

export default RecoveryPassword;
