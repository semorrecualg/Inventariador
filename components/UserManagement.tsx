
import React, { useState } from 'react';
import { User } from '../types';
import { 
  Users, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  X, 
  Shield, 
  UserCircle,
  Key,
  Check
} from 'lucide-react';

interface UserManagementProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  onBack: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, setUsers, onBack }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newEmail || !newPassword) return;

    const newUser: User = {
      username: newUsername.toUpperCase(),
      email: newEmail,
      password: newPassword,
      isAdmin: false,
      mustChangePassword: true
    };

    setUsers(prev => [...prev, newUser]);
    setNewUsername('');
    setNewEmail('');
    setNewPassword('');
    setIsModalOpen(false);
  };

  const removeUser = (email: string) => {
    if (email.toLowerCase() === "semorr@gmail.com") {
      alert("Não é possível remover o administrador mestre.");
      return;
    }
    if (confirm("Deseja realmente remover este acesso?")) {
      setUsers(prev => prev.filter(u => u.email !== email));
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 animate-fadeIn">
      {/* Header */}
      <div className="p-6 bg-white border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="p-2.5 bg-gray-50 rounded-2xl text-gray-400 active:scale-90 transition-all">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-gray-900 uppercase leading-none">Usuários</h2>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">Gestão de Acessos</p>
          </div>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-32">
        {users.map((u) => (
          <div 
            key={u.email} 
            className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between group"
          >
            <div className="flex items-center space-x-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${u.isAdmin ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400'}`}>
                {u.isAdmin ? <Shield size={24} /> : <UserCircle size={24} />}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-black text-xs uppercase text-gray-900 tracking-tight">{u.username}</span>
                  {u.mustChangePassword && (
                    <span className="bg-amber-100 text-amber-600 text-[6px] font-black px-1.5 py-0.5 rounded-full uppercase">Senha Temp.</span>
                  )}
                </div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{u.email}</p>
              </div>
            </div>
            
            {!u.isAdmin && (
              <button 
                onClick={() => removeUser(u.email)}
                className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Modal Novo Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full rounded-[2.5rem] p-8 shadow-2xl relative animate-bounceIn">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 text-gray-400"
            >
              <X size={24} />
            </button>
            
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-600 mx-auto mb-4">
                <Plus size={32} />
              </div>
              <h3 className="text-xl font-black text-gray-900 uppercase">Novo Acesso</h3>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Defina as credenciais iniciais</p>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-2">Username</label>
                <input 
                  type="text" 
                  required
                  placeholder="EX: JOAO.SILVA"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm"
                />
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-2">E-mail</label>
                <input 
                  type="email" 
                  required
                  placeholder="usuario@empresa.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm"
                />
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-2">Senha Inicial</label>
                <input 
                  type="password" 
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm"
                />
              </div>
              
              <div className="bg-blue-50 p-4 rounded-2xl flex items-start space-x-3 mb-6">
                <Key size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[9px] font-bold text-blue-700 uppercase leading-relaxed">
                  O usuário será obrigado a alterar esta senha no primeiro login para maior segurança.
                </p>
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-blue-100 active:scale-95 transition-all"
              >
                Criar Acesso
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
