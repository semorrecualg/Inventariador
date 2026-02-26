
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
    
    // Busca o usuário comparando exclusivamente o username
    const foundUser = users.find(u => 
      u.username.toLowerCase() === username.toLowerCase()
    );
    
    if (foundUser && foundUser.password === password) {
      onLogin(foundUser);
    } else {
      setError("Usuário ou senha incorretos.");
    }
  };

  return (
    <div className="p-8 h-full flex flex-col justify-center animate-fadeIn bg-bg-main">
      <div className="mb-12 text-center">
        <div className="w-24 h-24 bg-sky-50 border border-sky-100 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-sm">
          <LogIn className="text-sky-600" size={48} />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight uppercase">GBR Auditoria</h1>
        <p className="text-slate-400 mt-3 text-[11px] font-bold uppercase tracking-[0.2em]">Inteligência Patrimonial</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-sm mx-auto w-full">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-[10px] font-bold uppercase flex items-center mb-6 tracking-widest shadow-sm">
            <AlertCircle size={18} className="mr-3 shrink-0" />
            {error}
          </div>
        )}
        
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Usuário</label>
          <div className="relative">
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-14 pr-6 py-5 rounded-3xl border border-slate-200 bg-white focus:border-sky-500 outline-none transition-all text-slate-900 font-bold shadow-sm"
              placeholder="NOME DE USUÁRIO"
            />
            <UserCircle className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
          </div>
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
          className="w-full bg-sky-600 text-white font-bold py-5 rounded-3xl shadow-lg shadow-sky-900/10 hover:bg-sky-700 active:scale-[0.98] transition-all mt-8 uppercase tracking-[0.2em] text-sm"
        >
          Acessar Sistema
        </button>
      </form>

      <div className="mt-16 text-center">
        <p className="text-slate-300 text-[9px] font-bold uppercase tracking-[0.4em]">
          GBR Intelligent Systems
        </p>
      </div>
    </div>
  );
};

export default Login;
