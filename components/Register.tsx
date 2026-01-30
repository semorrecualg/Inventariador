
import React, { useState } from 'react';
import { User } from '../types';
import { UserPlus, ChevronLeft } from 'lucide-react';

interface RegisterProps {
  onRegister: (user: User) => void;
  onGoToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onRegister, onGoToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && email && password) {
      onRegister({ username: name.toUpperCase(), email: email.toUpperCase() });
    }
  };

  return (
    <div className="p-8 h-full flex flex-col justify-center">
      <div className="mb-10">
        <button onClick={onGoToLogin} className="mb-6 text-gray-500 flex items-center font-black text-[10px] uppercase tracking-widest">
          <ChevronLeft size={20} className="mr-1" /> Voltar
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Nova Conta</h1>
        <p className="text-gray-500 mt-2">Comece a gerenciar seu imobilizado hoje</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
          <input 
            type="text" 
            required
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 uppercase"
            placeholder="JOÃO SILVA"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mail Profissional</label>
          <input 
            type="email" 
            required
            value={email}
            onChange={(e) => setEmail(e.target.value.toUpperCase())}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 uppercase"
            placeholder="JOAO@EMPRESA.COM"
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
          Criar Conta
        </button>
      </form>
    </div>
  );
};

export default Register;
