
import React, { useState } from 'react';
import { User } from '../types';
import { 
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
  Save,
  ChevronRight
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
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn">
      {/* Header */}
      <div className="p-6 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 active:scale-90 transition-all shadow-sm">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Gestão de Usuários</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Clique duplo para editar dados</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="w-12 h-12 bg-sky-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-sky-900/20 active:scale-90 transition-all"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-32 no-scrollbar">
        {users.map((u) => (
          <div 
            key={u.email} 
            onDoubleClick={() => handleOpenEdit(u)}
            className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center justify-between group active:scale-[0.98] transition-all cursor-pointer hover:border-sky-300 modern-card"
          >
            <div className="flex items-center space-x-5 flex-1 min-w-0">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner border ${u.isAdmin ? 'bg-amber-50 text-amber-500 border-amber-100' : 'bg-sky-50 text-sky-600 border-sky-100'}`}>
                {u.isAdmin ? <Shield size={32} /> : <UserCircle size={32} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-3 mb-1">
                  <span className="font-bold text-base uppercase text-slate-900 tracking-tight truncate">{u.username}</span>
                  <span className="bg-slate-100 text-slate-400 text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest border border-slate-200">LOGIN ID</span>
                </div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest truncate">{u.email}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 ml-4">
              <div className="hidden group-hover:flex items-center space-x-2">
                 <button onClick={() => handleOpenEdit(u)} className="w-11 h-11 flex items-center justify-center text-sky-600 bg-sky-50 border border-sky-100 rounded-xl transition-all shadow-sm hover:bg-sky-100">
                  <Edit3 size={20} />
                </button>
                {!u.isAdmin && (
                  <button onClick={(e) => { e.stopPropagation(); removeUser(u.email); }} className="w-11 h-11 flex items-center justify-center text-red-500 bg-red-50 border border-red-100 rounded-xl transition-all shadow-sm hover:bg-red-100">
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
              <ChevronRight size={20} className="text-slate-200 group-hover:hidden" />
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Edição */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl relative animate-slideUp overflow-hidden modern-card">
            <button onClick={() => setIsEditModalOpen(false)} className="absolute top-8 right-8 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all shadow-sm"><X size={20} /></button>
            <div className="text-center mb-10">
              <h3 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Editar Credenciais</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2">Username e Senha de Acesso</p>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Username de Login</label>
                <div className="relative">
                  <input type="text" required value={editUsername} onChange={(e) => setEditUsername(e.target.value.toUpperCase())} className="w-full pl-14 pr-6 py-5 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm uppercase transition-all shadow-sm" />
                  <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Senha</label>
                <div className="relative">
                  <input type="text" required value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full pl-14 pr-6 py-5 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">E-mail</label>
                <div className="relative">
                  <input type="email" required value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full pl-14 pr-6 py-5 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                </div>
              </div>
              <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-bold uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all mt-6 flex items-center justify-center space-x-3">
                <Save size={20} />
                <span className="text-sm">Atualizar Acesso</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Novo Usuário */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl relative animate-slideUp overflow-hidden modern-card">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-8 right-8 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all shadow-sm"><X size={20} /></button>
            <div className="text-center mb-10">
              <h3 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Novo Inventariante</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2">Criação de Username de Acesso</p>
            </div>
            <form onSubmit={handleAddUser} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Username</label>
                <input type="text" required placeholder="EX: PEDRO.GBR" value={newUsername} onChange={(e) => setNewUsername(e.target.value.toUpperCase())} className="w-full px-6 py-5 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">E-mail</label>
                <input type="email" required placeholder="email@exemplo.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full px-6 py-5 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Senha</label>
                <input type="password" required placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-6 py-5 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
              </div>
              <button type="submit" className="w-full py-5 bg-sky-600 text-white rounded-[2rem] font-bold uppercase tracking-[0.2em] shadow-xl shadow-sky-900/10 active:scale-95 transition-all mt-6 text-sm">
                Confirmar Cadastro
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="p-8 bg-white border-t border-slate-200 flex flex-col items-center">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.6em] mb-1">GBR Intelligent Systems</p>
      </div>
    </div>
  );
};



export default UserManagement;
