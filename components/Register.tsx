
import React, { useState } from 'react';
import { User } from '../types';
import { UserPlus, ChevronLeft } from 'lucide-react';

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
    <div className="p-8 h-full flex flex-col justify-center animate-fadeIn">
      <div className="mb-10">
        <button onClick={onGoToLogin} className="mb-6 text-gray-400 flex items-center font-black text-[10px] uppercase tracking-widest">
          <ChevronLeft size={20} className="mr-1" /> Voltar ao Login
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Novo Acesso</h1>
        <p className="text-gray-500 mt-2">Crie suas credenciais de inventariante</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Username (Acesso)</label>
          <input 
            type="text" 
            required
            value={username}
            onChange={(e) => setUsername(e.target.value.toUpperCase())}
            className="w-full px-4 py-4 rounded-2xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 font-bold uppercase"
            placeholder="EX: JOAO.SILVA"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">E-mail Corporativo</label>
          <input 
            type="email" 
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-4 rounded-2xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 font-bold"
            placeholder="contato@gbr.com.br"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Senha</label>
          <input 
            type="password" 
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-4 rounded-2xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            placeholder="••••••••"
          />
        </div>
        <button 
          type="submit"
          className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all mt-6 uppercase tracking-widest"
        >
          Criar Meu Acesso
        </button>
      </form>
    </div>
  );
};

export default Register;
