
import React, { useState } from 'react';
import { User } from '../types';
import { ChevronLeft } from 'lucide-react';

interface RegisterProps {
  onRegister: (user: User) => void;
  onGoToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onRegister, onGoToLogin }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username && email && password) {
      onRegister({ 
        username: username.toUpperCase(), 
        email: email.toLowerCase(),
        password: password,
        mustChangePassword: false
      });
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
          className="w-full bg-sky-600 text-white font-bold py-5 rounded-3xl shadow-lg shadow-sky-900/10 hover:bg-sky-700 active:scale-[0.98] transition-all mt-8 uppercase tracking-[0.2em] text-sm"
        >
          Criar Meu Acesso
        </button>
      </form>
    </div>
  );
};

export default Register;
