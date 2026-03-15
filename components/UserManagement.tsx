
import React, { useState } from 'react';
import { User } from '../types';
import Modal from './Modal';
import BackButton from './BackButton';
import { 
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
  ChevronRight,
  Eye,
  EyeOff
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
  
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success' | 'confirm';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showModal = (title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' | 'confirm' = 'info', onConfirm?: () => void) => {
    setModalConfig({ isOpen: true, title, message, type, onConfirm });
  };
  
  // States para Novo Usuário
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // States para Edição
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    const username = newUsername.toUpperCase().trim();
    const email = newEmail.toLowerCase().trim();
    const password = newPassword.trim();

    if (!username || !email || !password) return;

    // Verificar duplicidade
    if (users.find(u => u.email.toLowerCase() === email || u.username.toUpperCase() === username)) {
      showModal("Erro de Cadastro", "Usuário ou E-mail já cadastrado!", "error");
      return;
    }

    const newUser: User = {
      username,
      email,
      password,
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

    const username = editUsername.toUpperCase().trim();
    const email = editEmail.toLowerCase().trim();
    const password = editPassword.trim();

    // Verificar duplicidade (excluindo o próprio usuário)
    if (users.find(u => u.email !== selectedUser.email && (u.email.toLowerCase() === email || u.username.toUpperCase() === username))) {
      showModal("Erro de Edição", "Este Username ou E-mail já está em uso por outro usuário!", "error");
      return;
    }

    setUsers(prev => {
      const updated = prev.map(u => 
        u.email === selectedUser.email 
          ? { ...u, username, email, password } 
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
      showModal("Operação Negada", "O administrador mestre não pode ser excluído.", "warning");
      return;
    }
    
    showModal(
      "Remover Acesso", 
      "Deseja realmente remover este acesso?", 
      "confirm",
      () => {
        setUsers(prev => {
          const updated = prev.filter(u => u.email !== email);
          localStorage.setItem('app_users', JSON.stringify(updated));
          return updated;
        });
      }
    );
  };

  return (
    <div className="flex flex-col h-full bg-bg-main animate-fadeIn">
      {/* Header */}
      <div className="p-6 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center space-x-4">
          <BackButton onClick={onBack} label="Gestão de Usuários" subLabel="Controle de Acessos" />
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
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative animate-slideUp my-auto modern-card">
            <button onClick={() => setIsEditModalOpen(false)} className="absolute top-6 right-6 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all shadow-sm"><X size={20} /></button>
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Editar Credenciais</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2">Username e Senha de Acesso</p>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Username de Login</label>
                <div className="relative">
                  <input type="text" required autoComplete="off" value={editUsername} onChange={(e) => setEditUsername(e.target.value.toUpperCase())} className="w-full pl-12 pr-6 py-4 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm uppercase transition-all shadow-sm" />
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Senha</label>
                <div className="relative">
                  <input type={showEditPassword ? "text" : "password"} required autoComplete="off" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full pl-12 pr-14 py-4 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <button 
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 p-2 hover:text-sky-600 transition-colors"
                  >
                    {showEditPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">E-mail</label>
                <div className="relative">
                  <input type="email" required autoComplete="off" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full pl-12 pr-6 py-4 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                </div>
              </div>
              <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-[2rem] font-bold uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all mt-4 flex items-center justify-center space-x-3">
                <Save size={18} />
                <span className="text-sm">Atualizar Acesso</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Novo Usuário */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative animate-slideUp my-auto modern-card">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-6 right-6 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all shadow-sm"><X size={20} /></button>
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Novo Inventariante</h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2">Criação de Username de Acesso</p>
            </div>
            <form onSubmit={handleAddUser} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Username</label>
                <input type="text" required autoComplete="off" placeholder="EX: PEDRO.GBR" value={newUsername} onChange={(e) => setNewUsername(e.target.value.toUpperCase())} className="w-full px-6 py-4 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">E-mail</label>
                <input type="email" required autoComplete="off" placeholder="email@exemplo.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full px-6 py-4 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Senha</label>
                <div className="relative">
                  <input type={showNewPassword ? "text" : "password"} required autoComplete="off" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full pl-6 pr-14 py-4 bg-slate-50 rounded-3xl border border-slate-200 focus:border-sky-500 focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
                  <button 
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 p-2 hover:text-sky-600 transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full py-4 bg-sky-600 text-white rounded-[2rem] font-bold uppercase tracking-[0.2em] shadow-xl shadow-sky-900/10 active:scale-95 transition-all mt-4 text-sm">
                Confirmar Cadastro
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="p-8 bg-white border-t border-slate-200 flex flex-col items-center">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.6em] mb-1">GBR Intelligent Systems</p>
      </div>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
      />
    </div>
  );
};



export default UserManagement;
