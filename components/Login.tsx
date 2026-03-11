
import React, { useState } from 'react';
import { User } from '../types';
import { LogIn, UserCircle, AlertCircle } from 'lucide-react';

interface LoginProps {
  users: User[];
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ users, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Busca o usuário comparando username ou email
    const foundUser = users.find(u => 
      u.username.toLowerCase() === username.toLowerCase().trim() ||
      u.email.toLowerCase() === username.toLowerCase().trim()
    );
    
    if (foundUser && foundUser.password === password) {
      onLogin(foundUser);
    } else {
      setError("Usuário ou senha incorretos.");
    }
  };

  return (
    <div className="p-6 h-full flex flex-col justify-center animate-fadeIn bg-bg-main">
      <div className="mb-10 text-center">
        <div className="w-20 h-20 bg-white border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
          <LogIn className="text-blue-600" size={32} />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">GBR Auditoria</h1>
        <p className="text-slate-400 mt-2 text-[10px] font-bold uppercase tracking-[0.2em]">Inteligência Patrimonial</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm mx-auto w-full">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-[9px] font-bold uppercase flex items-center mb-4 tracking-widest shadow-sm">
            <AlertCircle size={16} className="mr-2 shrink-0" />
            {error}
          </div>
        )}
        
        <div className="space-y-1.5">
          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] ml-1">Usuário</label>
          <div className="relative">
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-200 bg-white focus:border-blue-500 outline-none transition-all text-slate-900 font-bold shadow-sm text-sm"
              placeholder="NOME DE USUÁRIO"
            />
            <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
          </div>
        </div>
        
        <div className="space-y-1.5">
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

        <button 
          type="submit"
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md active:scale-[0.98] transition-all mt-6 uppercase tracking-[0.1em] text-xs"
        >
          Acessar Sistema
        </button>
      </form>

      <div className="mt-12 text-center">
        <p className="text-slate-300 text-[8px] font-bold uppercase tracking-[0.3em]">
          GBR Intelligent Systems
        </p>
      </div>
    </div>
  );
};

export default Login;
