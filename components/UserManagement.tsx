
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
  Edit3,
  Lock,
  Mail,
  User as UserIcon,
  Save
} from 'lucide-react';

interface UserManagementProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  onBack: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, setUsers, onBack }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // States para Novo Usuário
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // States para Edição
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newEmail || !newPassword) return;

    const newUser: User = {
      username: newUsername.toUpperCase(),
      email: newEmail.toLowerCase(),
      password: newPassword,
      isAdmin: false,
      mustChangePassword: true
    };

    setUsers(prev => {
      const updated = [...prev, newUser];
      localStorage.setItem('app_users', JSON.stringify(updated));
      return updated;
    });
    
    setNewUsername('');
    setNewEmail('');
    setNewPassword('');
    setIsAddModalOpen(false);
  };

  const handleOpenEdit = (user: User) => {
    setSelectedUser(user);
    setEditUsername(user.username);
    setEditEmail(user.email);
    setEditPassword(user.password || '');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !editUsername || !editEmail || !editPassword) return;

    setUsers(prev => {
      const updated = prev.map(u => 
        u.email === selectedUser.email 
          ? { ...u, username: editUsername.toUpperCase(), email: editEmail.toLowerCase(), password: editPassword } 
          : u
      );
      localStorage.setItem('app_users', JSON.stringify(updated));
      return updated;
    });

    setIsEditModalOpen(false);
    setSelectedUser(null);
  };

  const removeUser = (email: string) => {
    if (email.toLowerCase() === "semorr@gmail.com") {
      alert("Operação negada: O administrador mestre não pode ser excluído.");
      return;
    }
    if (confirm("Deseja realmente remover este acesso?")) {
      setUsers(prev => {
        const updated = prev.filter(u => u.email !== email);
        localStorage.setItem('app_users', JSON.stringify(updated));
        return updated;
      });
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
            <h2 className="text-xl font-black text-gray-900 uppercase leading-none">Gestão de Usuários</h2>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">Clique duplo para editar dados</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-32 no-scrollbar">
        {users.map((u) => (
          <div 
            key={u.email} 
            onDoubleClick={() => handleOpenEdit(u)}
            className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center justify-between group active:scale-[0.98] transition-all cursor-pointer hover:border-blue-200"
          >
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${u.isAdmin ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'}`}>
                {u.isAdmin ? <Shield size={28} /> : <UserCircle size={28} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-black text-sm uppercase text-gray-900 tracking-tight truncate">{u.username}</span>
                  <span className="bg-gray-100 text-gray-400 text-[7px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">LOGIN ID</span>
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{u.email}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 ml-4">
              <div className="hidden group-hover:flex items-center space-x-1">
                 <button onClick={() => handleOpenEdit(u)} className="w-10 h-10 flex items-center justify-center text-blue-500 bg-blue-50 rounded-xl transition-all">
                  <Edit3 size={18} />
                </button>
                {!u.isAdmin && (
                  <button onClick={(e) => { e.stopPropagation(); removeUser(u.email); }} className="w-10 h-10 flex items-center justify-center text-red-500 bg-red-50 rounded-xl transition-all">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <ChevronRight size={16} className="text-gray-200 group-hover:hidden" />
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Edição */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative animate-bounceIn overflow-hidden">
            <button onClick={() => setIsEditModalOpen(false)} className="absolute top-8 right-8 text-gray-400 hover:text-black transition-colors"><X size={24} /></button>
            <div className="text-center mb-8">
              <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Editar Credenciais</h3>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Username e Senha de Acesso</p>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-5">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-2">Username de Login</label>
                <div className="relative">
                  <input type="text" required value={editUsername} onChange={(e) => setEditUsername(e.target.value.toUpperCase())} className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm uppercase transition-all" />
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-2">Senha</label>
                <div className="relative">
                  <input type="text" required value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm transition-all" />
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-2">E-mail</label>
                <div className="relative">
                  <input type="email" required value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm transition-all" />
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                </div>
              </div>
              <button type="submit" className="w-full py-5 bg-gray-900 text-white rounded-[1.8rem] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all mt-4 flex items-center justify-center space-x-2">
                <Save size={18} />
                <span>Atualizar Acesso</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Novo Usuário */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative animate-bounceIn overflow-hidden">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-8 right-8 text-gray-400 hover:text-black transition-colors"><X size={24} /></button>
            <div className="text-center mb-8">
              <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Novo Inventariante</h3>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Criação de Username de Acesso</p>
            </div>
            <form onSubmit={handleAddUser} className="space-y-5">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-2">Username</label>
                <input type="text" required placeholder="EX: PEDRO.GBR" value={newUsername} onChange={(e) => setNewUsername(e.target.value.toUpperCase())} className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm transition-all" />
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-2">E-mail</label>
                <input type="email" required placeholder="email@exemplo.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm transition-all" />
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-2">Senha</label>
                <input type="password" required placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-sm transition-all" />
              </div>
              <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-[1.8rem] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-100 active:scale-95 transition-all mt-4">
                Confirmar Cadastro
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="p-8 bg-white border-t border-gray-100 flex flex-col items-center">
        <p className="text-[9px] font-black text-gray-200 uppercase tracking-[0.5em] mb-1">GBR Inteligência Patrimonial</p>
      </div>
    </div>
  );
};

// Reutilização do componente de seta para o menu
const ChevronRight = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

export default UserManagement;
