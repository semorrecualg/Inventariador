
import React, { useState } from 'react';
import { ShieldCheck, Key, Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

interface ChangePasswordProps {
  onPasswordChanged: (newPassword: string) => void;
}

const ChangePassword: React.FC<ChangePasswordProps> = ({ onPasswordChanged }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 4) {
      setError("A senha deve ter pelo menos 4 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    onPasswordChanged(newPassword);
  };

  return (
    <div className="flex flex-col h-full bg-bg-main p-8 animate-fadeIn">
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        <div className="text-center mb-12">
          <div className="w-24 h-24 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 mx-auto mb-8 shadow-sm border border-emerald-100">
            <ShieldCheck size={48} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 uppercase tracking-tight">Segurança Ativa</h2>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-4 leading-relaxed">
            Identificamos que este é seu primeiro acesso. <br/> 
            Por favor, defina sua senha de uso diário.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-5 rounded-2xl text-[10px] font-bold uppercase tracking-widest border border-red-100 shadow-sm">
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Nova Senha</label>
              <div className="relative">
                <input 
                  type={showPass ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-14 py-5 bg-white rounded-3xl border border-slate-200 focus:border-sky-500 outline-none font-bold text-sm shadow-sm transition-all"
                  placeholder="SENHA FORTE"
                />
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <button 
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-sky-600 transition-colors"
                >
                  {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Confirmar Senha</label>
              <div className="relative">
                <input 
                  type={showPass ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-14 py-5 bg-white rounded-3xl border border-slate-200 focus:border-sky-500 outline-none font-bold text-sm shadow-sm transition-all"
                  placeholder="REPITA A SENHA"
                />
                <CheckCircle2 className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
              </div>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-5 bg-emerald-600 text-white rounded-[2rem] font-bold uppercase tracking-widest shadow-lg shadow-emerald-900/10 active:scale-95 transition-all mt-8 text-sm"
          >
            Atualizar e Entrar
          </button>
        </form>
      </div>

      <div className="text-center mt-8">
        <div className="inline-flex items-center space-x-3 text-[10px] font-bold text-slate-300 uppercase tracking-[0.4em]">
          <Key size={14} />
          <span>Troca Obrigatória • V1.0 Sec</span>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
