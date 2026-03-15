
import React, { useState } from 'react';
import { ChevronLeft, Loader2, AlertCircle } from 'lucide-react';
import { signUp } from '../services/supabaseService';

interface RegisterProps {
  onRegister: () => void;
  onGoToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onRegister, onGoToLogin }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await signUp(email.trim(), password, username.toUpperCase());
      onRegister();
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Erro ao criar acesso.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 h-full flex flex-col justify-start pt-12 animate-fadeIn bg-bg-main overflow-y-auto no-scrollbar pb-20">
      <div className="mb-12 max-w-sm mx-auto w-full">
        <button onClick={onGoToLogin} className="mb-8 text-slate-400 flex items-center font-bold text-[10px] uppercase tracking-[0.2em] hover:text-sky-600 transition-colors">
          <ChevronLeft size={18} className="mr-2" /> Voltar ao Login
        </button>
        <h1 className="text-3xl font-bold text-slate-900 uppercase tracking-tight">Novo Acesso</h1>
        <p className="text-slate-400 mt-3 text-[11px] font-bold uppercase tracking-[0.2em]">Crie suas credenciais de inventariante</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-sm mx-auto w-full">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-[9px] font-bold uppercase flex items-center mb-4 tracking-widest shadow-sm">
            <AlertCircle size={16} className="mr-2 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Username</label>
          <input 
            type="text" 
            required
            value={username}
            onChange={(e) => setUsername(e.target.value.toUpperCase())}
            className="w-full px-6 py-5 rounded-3xl border border-slate-200 bg-white focus:border-sky-500 outline-none transition-all text-slate-900 font-bold uppercase shadow-sm"
            placeholder="EX: JOAO.SILVA"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">E-mail Corporativo</label>
          <input 
            type="email" 
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-6 py-5 rounded-3xl border border-slate-200 bg-white focus:border-sky-500 outline-none transition-all text-slate-900 font-bold shadow-sm"
            placeholder="contato@gbr.com.br"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Senha</label>
          <input 
            type="password" 
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-6 py-5 rounded-3xl border border-slate-200 bg-white focus:border-sky-500 outline-none transition-all text-slate-900 font-bold shadow-sm"
            placeholder="••••••••"
          />
        </div>
        <button 
          type="submit"
          disabled={isLoading}
          className="w-full bg-sky-600 text-white font-bold py-5 rounded-3xl shadow-lg shadow-sky-900/10 hover:bg-sky-700 active:scale-[0.98] transition-all mt-8 uppercase tracking-[0.2em] text-sm flex items-center justify-center space-x-2 disabled:opacity-70"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Criando Acesso...</span>
            </>
          ) : (
            <span>Criar Meu Acesso</span>
          )}
        </button>
      </form>
    </div>
  );
};

export default Register;
