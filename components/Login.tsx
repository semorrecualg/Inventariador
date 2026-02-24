
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
    <div className="p-8 h-full flex flex-col justify-center animate-fadeIn">
      <div className="mb-10 text-center">
        <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg rotate-3">
          <LogIn className="text-white" size={40} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">GBR Patrimônio</h1>
        <p className="text-gray-500 mt-2 text-sm">Acesse o sistema via username</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-[10px] font-black uppercase flex items-center mb-4 tracking-widest">
            <AlertCircle size={16} className="mr-2 shrink-0" />
            {error}
          </div>
        )}
        
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Nome de Usuário</label>
          <div className="relative">
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-100 bg-white focus:ring-0 focus:border-blue-500 outline-none transition-all text-gray-900 font-bold"
              placeholder="DIGITE SEU USERNAME"
            />
            <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
          </div>
        </div>
        
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Senha de Acesso</label>
          <input 
            type="password" 
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-4 rounded-2xl border-2 border-gray-100 bg-white focus:ring-0 focus:border-blue-500 outline-none transition-all text-gray-900 font-bold"
            placeholder="••••••••"
          />
        </div>

        <button 
          type="submit"
          className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all mt-6 uppercase tracking-widest"
        >
          Entrar no Sistema
        </button>
      </form>

      <div className="mt-12 text-center">
        <p className="text-gray-300 text-[9px] font-black uppercase tracking-[0.3em]">
          GBR Inteligência Patrimonial
        </p>
      </div>
    </div>
  );
};

export default Login;
