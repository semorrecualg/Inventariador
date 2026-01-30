
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
    <div className="flex flex-col h-full bg-white p-8 animate-fadeIn">
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-emerald-50 rounded-[2rem] flex items-center justify-center text-emerald-600 mx-auto mb-6 shadow-inner">
            <ShieldCheck size={40} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 uppercase">Segurança Ativa</h2>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2 leading-relaxed">
            Identificamos que este é seu primeiro acesso. <br/> 
            Por favor, defina sua senha de uso diário.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-[10px] font-black uppercase tracking-widest">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="relative">
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-2">Nova Senha</label>
              <div className="relative">
                <input 
                  type={showPass ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-12 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm"
                  placeholder="SENHA FORTE"
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                <button 
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-blue-500"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="relative">
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-2">Confirmar Senha</label>
              <div className="relative">
                <input 
                  type={showPass ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-12 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm"
                  placeholder="REPITA A SENHA"
                />
                <CheckCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
              </div>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-5 bg-emerald-600 text-white rounded-[1.8rem] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 active:scale-95 transition-all mt-6"
          >
            Atualizar e Entrar
          </button>
        </form>
      </div>

      <div className="text-center">
        <div className="inline-flex items-center space-x-2 text-[9px] font-black text-gray-300 uppercase tracking-widest">
          <Key size={12} />
          <span>Troca Obrigatória • V1.0 Sec</span>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
