
import React, { useState } from 'react';
import { LogIn, UserCircle, AlertCircle, Loader2, Mail, Key } from 'lucide-react';
import { signIn, signInWithMagicLink } from '../services/supabaseService';

interface LoginProps {
  onLogin: () => void;
  onNavigateToRegister: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, onNavigateToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [authMode, setAuthMode] = useState<'password' | 'magic'>('password');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    try {
      if (authMode === 'password') {
        await signIn(email.trim(), password);
        onLogin();
      } else {
        await signInWithMagicLink(email.trim());
        setMagicLinkSent(true);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Erro ao autenticar. Verifique seus dados.");
    } finally {
      setIsLoading(false);
    }
  };

  if (magicLinkSent) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center animate-fadeIn bg-bg-main text-center">
        <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-emerald-100">
          <Mail size={32} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">E-mail Enviado!</h2>
        <p className="text-slate-500 mt-4 text-xs font-medium leading-relaxed max-w-xs">
          Enviamos um link de acesso para <span className="text-slate-900 font-bold">{email}</span>. 
          Basta clicar no link no seu e-mail para entrar automaticamente.
        </p>
        <button 
          onClick={() => setMagicLinkSent(false)}
          className="mt-10 text-blue-600 font-bold uppercase text-[10px] tracking-widest"
        >
          Voltar para o Login
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col justify-start pt-12 animate-fadeIn bg-bg-main overflow-y-auto no-scrollbar pb-20">
      <div className="mb-10 text-center">
        <div className="w-20 h-20 bg-white border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
          <LogIn className="text-blue-600" size={32} />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">GBR Auditoria</h1>
        <p className="text-slate-400 mt-2 text-[10px] font-bold uppercase tracking-[0.2em]">Inteligência Patrimonial</p>
      </div>

      <div className="flex p-1 bg-slate-100 rounded-xl mb-8 max-w-sm mx-auto w-full border border-slate-200">
        <button 
          onClick={() => setAuthMode('password')}
          className={`flex-1 py-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center space-x-2 ${authMode === 'password' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
        >
          <Key size={14} />
          <span>Senha</span>
        </button>
        <button 
          onClick={() => setAuthMode('magic')}
          className={`flex-1 py-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center space-x-2 ${authMode === 'magic' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
        >
          <Mail size={14} />
          <span>Link Mágico</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm mx-auto w-full">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-[9px] font-bold uppercase flex items-center mb-4 tracking-widest shadow-sm">
            <AlertCircle size={16} className="mr-2 shrink-0" />
            {error}
          </div>
        )}
        
        <div className="space-y-1.5">
          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] ml-1">E-mail</label>
          <div className="relative">
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-200 bg-white focus:border-blue-500 outline-none transition-all text-slate-900 font-bold shadow-sm text-sm"
              placeholder="SEU E-MAIL"
            />
            <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
          </div>
        </div>
        
        {authMode === 'password' && (
          <div className="space-y-1.5 animate-fadeIn">
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] ml-1">Senha</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-white focus:border-blue-500 outline-none transition-all text-slate-900 font-bold shadow-sm text-sm"
              placeholder="••••••••"
            />
          </div>
        )}

        <button 
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md active:scale-[0.98] transition-all mt-6 uppercase tracking-[0.1em] text-xs flex items-center justify-center space-x-2 disabled:opacity-70"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>{authMode === 'password' ? 'Autenticando...' : 'Enviando Link...'}</span>
            </>
          ) : (
            <span>{authMode === 'password' ? 'Acessar Sistema' : 'Receber Link por E-mail'}</span>
          )}
        </button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Não tem uma conta?</p>
        <button 
          onClick={onNavigateToRegister}
          className="mt-2 text-blue-600 font-bold uppercase text-[11px] tracking-widest hover:underline"
        >
          Cadastre-se Agora
        </button>
      </div>

      <div className="mt-12 text-center">
        <p className="text-slate-300 text-[8px] font-bold uppercase tracking-[0.3em]">
          GBR Intelligent Systems
        </p>
      </div>
    </div>
  );
};

export default Login;
