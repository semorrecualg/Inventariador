
import React, { useState } from 'react';
import { User } from '../types';
import { LogIn, UserPlus } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
  onGoToRegister: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, onGoToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      onLogin({ username: email.split('@')[0].toUpperCase(), email: email.toUpperCase() });
    }
  };

  return (
    <div className="p-8 h-full flex flex-col justify-center animate-fadeIn">
      <div className="mb-10 text-center">
        <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg rotate-3">
          <LogIn className="text-white" size={40} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Bem-vindo</h1>
        <p className="text-gray-500 mt-2">Acesse seu inventário de ativos</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
          <input 
            type="email" 
            required
            value={email}
            onChange={(e) => setEmail(e.target.value.toUpperCase())}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 uppercase"
            placeholder="SEU@EMAIL.COM"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
          <input 
            type="password" 
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            placeholder="••••••••"
          />
        </div>
        <button 
          type="submit"
          className="w-full bg-blue-600 text-white font-black py-3 rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all mt-4 uppercase"
        >
          Entrar
        </button>
      </form>

      <div className="mt-8 text-center">
        <button 
          onClick={onGoToRegister}
          className="text-blue-600 font-black text-xs uppercase tracking-widest hover:underline flex items-center justify-center mx-auto"
        >
          <UserPlus size={18} className="mr-2" />
          Não tem conta? Cadastre-se
        </button>
      </div>
    </div>
  );
};

export default Login;
