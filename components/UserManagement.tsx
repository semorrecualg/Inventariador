
import React, { useState, useRef } from 'react';
import { User, UserRole } from '../types';
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
  EyeOff,
  Check,
  Cloud,
  Loader2,
  RefreshCw,
  AlertCircle,
  ArrowUp
} from 'lucide-react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { provisionUserInAuth, resetPassword, deleteUserFromCloud, ProvisionResult } from '../services/supabaseService';

interface UserManagementProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  onBack: () => void;
  currentUser: User | null;
  setUser?: React.Dispatch<React.SetStateAction<User | null>>;
  availableUnits: string[];
  unitsByTenant: Map<string, Set<string>>;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, setUsers, onBack, currentUser, setUser, availableUnits, unitsByTenant }) => {
  console.log('>>> [UserManagement] Rendered with:', { 
    currentUserEmail: currentUser?.email, 
    currentUserTenant: currentUser?.tenantid,
    availableUnitsCount: availableUnits?.length,
    availableUnits: availableUnits
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  
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

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showModal = (title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' | 'confirm' = 'info', onConfirm?: () => void) => {
    setModalConfig({ isOpen: true, title, message, type, onConfirm });
  };
  
  // States para Novo Usuário
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.AUDITOR);
  const [newTenantId] = useState(currentUser?.tenantid || '');
  const [newUnits, setNewUnits] = useState<string[]>(
    currentUser?.unitid && currentUser.unitid.toUpperCase() !== 'DEFAULT' 
      ? [currentUser.unitid] 
      : []
  );
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [provisionOnCreate, setProvisionOnCreate] = useState(true);

  // States para Edição
  const [editUsername, setEditUsername] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>(UserRole.AUDITOR);
  const [editTenantId, setEditTenantId] = useState('');
  const [editUnits, setEditUnits] = useState<string[]>([]);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.toLowerCase().trim();
    const username = newUsername.trim().toLowerCase() || email.split('@')[0].toLowerCase();
    const password = newPassword.trim();

    if (!email || !password) return;

    // Verificar duplicidade
    if (users.find(u => u.email.toLowerCase() === email || u.username.toUpperCase() === username)) {
      showModal("Erro de Cadastro", "Usuário ou E-mail já cadastrado!", "error");
      return;
    }

    // Provisionamento no Supabase Auth se solicitado
    if (provisionOnCreate) {
      setIsProvisioning(true);
      try {
        const result: ProvisionResult = await provisionUserInAuth(
          email, 
          password, 
          username, 
          newRole, 
          newTenantId, 
          newUnits, 
          newName.trim(),
          newUnits[0] || (currentUser?.unitid && currentUser.unitid.toUpperCase() !== 'DEFAULT' ? currentUser.unitid : ''),
          newUnits
        );
        if (result && result.existing) {
          showModal("Aviso de Acesso", "Este e-mail já possui acesso no Supabase Cloud. As permissões foram sincronizadas com sucesso! IMPORTANTE: A senha definida aqui NÃO altera a senha já existente na nuvem. Use o botão de 'Redefinição' se necessário.", "warning");
        }
      } catch (err) {
        const error = err as { message?: string };
        const msg = error.message || "Erro desconhecido";
        if (!msg.includes("already registered")) {
          showModal("Erro de Ativação Cloud", `O usuário foi criado localmente, mas não foi possível ativar na nuvem: ${msg}`, "warning");
          // Não interrompemos a criação local, apenas avisamos
        } else {
          showModal("Aviso de Acesso", "Este e-mail já possui acesso no Supabase Cloud. A senha definida aqui NÃO altera a senha já existente na nuvem. Use o botão de 'Redefinição' se necessário.", "warning");
        }
      } finally {
        setIsProvisioning(false);
      }
    }

    const normalizeValue = (val: string) => {
      if (!val) return '';
      const upper = val.toUpperCase();
      return (upper === 'DEFAULT' || upper === 'NULL' || upper === '0' || upper === 'default') ? '' : val;
    };

    const normalizeArray = (arr: unknown[]) => {
      if (!arr) return [];
      return arr.map(v => String(v)).filter(v => normalizeValue(v) !== '');
    };

    const normTenantId = normalizeValue(newTenantId);
    const normUnitId = normalizeValue(newUnits[0] || (currentUser?.unitid ? currentUser.unitid : ''));
    const normUnits = normalizeArray(newUnits.length > 0 ? newUnits : (currentUser?.unitid ? [currentUser.unitid] : []));

    const newUser: User = {
      username,
      name: newName.trim(),
      email,
      password,
      role: newRole,
      is_admin: newRole === UserRole.ADMIN || newRole === UserRole.MASTER || (email.toLowerCase() === 'semorr@gmail.com'),
      isAdmin: newRole === UserRole.ADMIN || newRole === UserRole.MASTER || (email.toLowerCase() === 'semorr@gmail.com'),
      mustChangePassword: true,
      tenantid: normTenantId,
      unitid: normUnitId,
      units: normUnits,
      tenants: [normTenantId] // Compatibilidade
    };

    setUsers(prev => {
      const updated = [...prev, newUser];
      localStorage.setItem('app_users', JSON.stringify(updated));
      return updated;
    });
    
    setNewName('');
    setNewUsername('');
    setNewEmail('');
    setNewPassword('');
    setNewRole(UserRole.AUDITOR);
    setIsAddModalOpen(false);
    
    // Feedback de sucesso para o usuário
    setToast({ message: `Usuário ${newName || username} cadastrado!`, type: 'success' });
    setTimeout(() => setToast(null), 3000);
    
    showModal("Sucesso", `O usuário ${newName || username} foi cadastrado com sucesso!`, "success");
  };

  const handleOpenEdit = (user: User) => {
    setSelectedUser(user);
    setEditUsername(user.username);
    setEditName(user.name || '');
    setEditEmail(user.email);
    setEditPassword(''); // Senha vazia por padrão ao editar para não sobrescrever se não for alterada
    setEditRole(user.role || (user.isAdmin ? UserRole.ADMIN : UserRole.AUDITOR));
    setEditTenantId(user.tenantid || '');
    const currentUnits = user.units || (Array.isArray(user.tenants) ? user.tenants : user.tenants ? [user.tenants] : (user.unitid ? [user.unitid] : []));
    setEditUnits(currentUnits);
    setIsEditModalOpen(true);
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    
    setIsResetting(true);
    try {
      await resetPassword(selectedUser.email);
      showModal("Sucesso", `Um link de redefinição de senha foi enviado para ${selectedUser.email}.`, "success");
    } catch (err: unknown) {
      const error = err as Error;
      showModal("Erro", `Não foi possível enviar o link: ${error.message}`, "error");
    } finally {
      setIsResetting(false);
    }
  };

  const handleProvision = async () => {
    if (!selectedUser || !editEmail || !editPassword) return;
    
    setIsProvisioning(true);
    try {
      const result: ProvisionResult = await provisionUserInAuth(
        editEmail, 
        editPassword, 
        editUsername, 
        editRole, 
        editTenantId, 
        editUnits, 
        editName.trim(),
        editUnits[0] || (selectedUser.unitid && selectedUser.unitid.toUpperCase() !== 'DEFAULT' ? selectedUser.unitid : ''),
        editUnits
      );
      if (result && result.existing) {
        showModal("Aviso", "Este e-mail já possui acesso ativo no Supabase Cloud. As permissões foram sincronizadas com sucesso! IMPORTANTE: A senha NÃO foi alterada. Para mudar a senha de um usuário que já existe, use o botão 'Enviar Link de Redefinição' abaixo.", "warning");
      } else {
        showModal("Sucesso", `O usuário ${editEmail} foi ativado no Supabase Auth com sucesso!`, "success");
      }
    } catch (err) {
      const error = err as { message?: string };
      const msg = error.message || "Erro desconhecido";
      if (msg.includes("already registered")) {
        showModal("Aviso", "Este e-mail já possui acesso ativo no Supabase Cloud. IMPORTANTE: A senha NÃO foi alterada. Para mudar a senha de um usuário que já existe, use o botão 'Enviar Link de Redefinição' abaixo.", "warning");
      } else {
        showModal("Erro de Ativação", `Não foi possível ativar o acesso: ${msg}`, "error");
      }
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !editEmail) {
      console.warn('[UserManagement] Tentativa de salvar edição com campos obrigatórios vazios.');
      return;
    }

    const email = editEmail.toLowerCase().trim();
    const username = editUsername.trim() || email.split('@')[0];
    const password = editPassword.trim() || selectedUser.password;
    const name = editName.trim();

    console.log(`[UserManagement] Salvando edição para ${selectedUser.email}:`, { name, username, email, editRole });

    // Verificar duplicidade (excluindo o próprio usuário)
    if (users.find(u => u.email !== selectedUser.email && (u.email.toLowerCase() === email || u.username.toUpperCase() === username.toUpperCase()))) {
      showModal("Erro de Edição", "Este Username ou E-mail já está em uso por outro usuário!", "error");
      return;
    }

    const normalizeValue = (val: string) => {
      if (!val) return '';
      const upper = val.toUpperCase();
      return (upper === 'DEFAULT' || upper === 'NULL' || upper === '0' || upper === 'default') ? '' : val;
    };

    const normalizeArray = (arr: unknown[]) => {
      if (!arr) return [];
      return arr.map(v => String(v)).filter(v => normalizeValue(v) !== '');
    };

    const is_admin = editRole === UserRole.ADMIN || editRole === UserRole.MASTER || (email.toLowerCase() === 'semorr@gmail.com');
    const normTenantId = normalizeValue(editTenantId);
    const normUnitId = normalizeValue(editUnits[0] || (selectedUser.unitid ? selectedUser.unitid : ''));
    const normUnits = normalizeArray(editUnits);

    const updatedUser: User = { 
      ...selectedUser, 
      username, 
      name,
      email, 
      password, 
      role: editRole, 
      is_admin, 
      isAdmin: is_admin, 
      tenantid: normTenantId,
      unitid: normUnitId,
      units: normUnits,
      tenants: [normTenantId]
    };

    setUsers(prev => {
      const updated = prev.map(u => u.email === selectedUser.email ? updatedUser : u);
      console.log('[UserManagement] Lista de usuários atualizada localmente.');
      localStorage.setItem('app_users', JSON.stringify(updated));
      return updated;
    });

    // Se o usuário editado for o usuário logado, atualiza o estado global e o localStorage
    if (currentUser && selectedUser.email.toLowerCase() === currentUser.email.toLowerCase()) {
      console.log('[UserManagement] Atualizando dados do usuário logado...');
      if (setUser) {
        setUser(updatedUser);
      }
      localStorage.setItem('app_current_user', JSON.stringify(updatedUser));
    }

    setIsEditModalOpen(false);
    setSelectedUser(null);
    
    // Feedback de sucesso para o usuário
    setToast({ message: `Credenciais de ${name || username} atualizadas!`, type: 'success' });
    setTimeout(() => setToast(null), 3000);
    
    showModal("Sucesso", `As credenciais de ${name || username} foram atualizadas com sucesso!`, "success");
  };

  const removeUser = (email: string) => {
    if (email.toLowerCase() === "semorr@gmail.com") {
      showModal("Operação Negada", "O administrador mestre não pode ser excluído.", "warning");
      return;
    }
    
    showModal(
      "Remover Acesso", 
      "Deseja realmente remover este acesso? Esta ação também removerá as permissões na nuvem.", 
      "confirm",
      async () => {
        try {
          // 1. Remove da Nuvem (Tabela user_permissions)
          await deleteUserFromCloud(email);
          
          // 2. Remove Localmente
          setUsers(prev => {
            const updated = prev.filter(u => u.email !== email);
            localStorage.setItem('app_users', JSON.stringify(updated));
            return updated;
          });
        } catch (err) {
          console.error('Erro ao remover usuário da nuvem:', err);
          showModal("Erro", "Não foi possível remover o usuário da nuvem. Tente novamente.", "error");
        }
      }
    );
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-bg-main animate-fadeIn">
      {/* Header */}
      <div className="pt-12 pb-6 px-6 bg-white border-b border-border flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center space-x-4">
          <BackButton onClick={onBack} label="Voltar" subLabel="Controle de Acessos" />
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="w-12 h-12 bg-accent text-white rounded-2xl flex items-center justify-center shadow-lg shadow-accent/20 active:scale-90 transition-all"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden bg-bg-main relative">
        {/* Toast Notification */}
        {toast && (
          <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[1000] px-6 py-3 rounded-2xl shadow-2xl border animate-slideDown flex items-center space-x-3 ${
            toast.type === 'success' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-danger text-white border-danger-soft'
          }`}>
            {toast.type === 'success' ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
            <span className="text-xs font-bold uppercase tracking-widest">{toast.message}</span>
          </div>
        )}

        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          atTopStateChange={(atTop) => setShowScrollTop(!atTop)}
          data={users.filter(u => {
            // Admin global vê tudo
            if (currentUser?.email === "semorr@gmail.com" || currentUser?.role === UserRole.ADMIN) return true;
            // Master vê apenas usuários do seu tenant
            if (currentUser?.role === UserRole.MASTER) {
              return u.tenantid === currentUser.tenantid || (u.tenants && u.tenants.includes(currentUser.tenantid || ''));
            }
            // Outros papéis não devem ver nada (ou apenas a si mesmos)
            return u.email === currentUser?.email;
          })}
          itemContent={(index, u) => (
            <div className="px-6 py-2">
              <div 
                key={u.email} 
                onDoubleClick={() => handleOpenEdit(u)}
                className="bg-white p-6 rounded-[2.5rem] border border-border shadow-sm flex items-center justify-between group active:scale-[0.98] transition-all cursor-pointer hover:border-accent modern-card"
              >
                <div className="flex items-center space-x-5 flex-1 min-w-0">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner border ${u.isAdmin ? 'bg-warning/10 text-warning border-warning/20' : 'bg-accent-soft text-accent border-accent/10'}`}>
                    {u.isAdmin ? <Shield size={32} /> : <UserCircle size={32} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-3 mb-1">
                      <span className="font-bold text-base text-ink tracking-tight truncate">{u.name || 'Sem Nome'}</span>
                      <div className="flex items-center space-x-1">
                        <span className="bg-bg-main text-ink-muted text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest border border-border">
                          {u.tenantid || 'S/ GRUPO'}
                        </span>
                        <span className="bg-accent/5 text-accent text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest border border-accent/10">
                          {u.role}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col space-y-0.5">
                      <p className="text-[10px] font-bold text-accent tracking-widest truncate uppercase">User: {u.username}</p>
                      <p className="text-[10px] font-medium text-ink-muted tracking-tight truncate">{u.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-[9px] font-bold text-accent uppercase tracking-widest">Unidades:</span>
                      {(u.units && u.units.length > 0 
                        ? u.units.filter(unit => unit.toUpperCase() !== 'DEFAULT') 
                        : (Array.isArray(u.tenants) && u.tenants.length > 0)
                          ? u.tenants 
                          : [u.unitid && u.unitid.toUpperCase() !== 'DEFAULT' ? u.unitid : 'GLOBAL']
                      ).filter(Boolean).map((t: string) => (
                        <span key={t} className="text-[9px] font-black text-ink uppercase tracking-widest bg-bg-main px-2 py-0.5 rounded-md border border-border">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 ml-4">
                  <div className="hidden group-hover:flex items-center space-x-2">
                    <button onClick={() => handleOpenEdit(u)} className="w-11 h-11 flex items-center justify-center text-accent bg-accent-soft border border-accent/10 rounded-xl transition-all shadow-sm hover:bg-accent/20">
                      <Edit3 size={20} />
                    </button>
                    {!u.isAdmin && (
                      <button onClick={(e) => { e.stopPropagation(); removeUser(u.email); }} className="w-11 h-11 flex items-center justify-center text-danger bg-danger/10 border border-danger/20 rounded-xl transition-all shadow-sm hover:bg-danger/20">
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                  <ChevronRight size={20} className="text-ink-muted/20 group-hover:hidden" />
                </div>
              </div>
            </div>
          )}
        />
        
        {/* Scroll to top button */}
        {showScrollTop && (
          <button
            onClick={() => virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' })}
            className="absolute bottom-6 right-6 w-12 h-12 bg-accent text-white rounded-full shadow-2xl flex items-center justify-center animate-bounce z-30 border-4 border-white active:scale-90 transition-all"
          >
            <ArrowUp size={24} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* Modal de Edição */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative animate-slideUp my-auto modern-card">
            <button onClick={() => setIsEditModalOpen(false)} className="absolute top-6 right-6 p-3 bg-bg-main border border-border rounded-2xl text-ink-muted hover:text-ink transition-all shadow-sm"><X size={20} /></button>
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-ink uppercase tracking-tight">Editar Credenciais</h3>
              <p className="text-[11px] font-bold text-ink-muted uppercase tracking-widest mt-2">Username e Senha de Acesso</p>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-5">
              {/* Grupo Empresarial - Agora no Topo e Fixo */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Grupo Empresarial</label>
                <div className="relative">
                  <input 
                    type="text" 
                    readOnly 
                    value={editTenantId} 
                    className="w-full px-6 py-4 bg-slate-50 rounded-3xl border border-border text-slate-500 font-bold text-sm outline-none cursor-not-allowed" 
                  />
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                </div>
              </div>

              {/* Unidades Operacionais - Filtradas pelo Grupo */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Unidades Operacionais (Permissões)</label>
                <div className="bg-bg-main rounded-[2rem] border border-border p-2 max-h-48 overflow-y-auto space-y-1 no-scrollbar shadow-inner">
                  {Array.from(unitsByTenant.get(editTenantId.toUpperCase()) || new Set<string>())
                    .map((unit: string) => {
                      const isSelected = editUnits.includes(unit);
                      return (
                        <div 
                          key={unit} 
                          onClick={() => {
                            setEditUnits((prev: string[]) => 
                              prev.includes(unit) ? prev.filter((t: string) => t !== unit) : [...prev, unit]
                            );
                          }}
                          className={`flex items-center justify-between p-3 rounded-2xl transition-all cursor-pointer group ${isSelected ? 'bg-accent/5 border border-accent/20' : 'hover:bg-white border border-transparent'}`}
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-accent border-accent text-white shadow-sm' : 'border-border bg-white'}`}>
                              {isSelected && <Check size={14} strokeWidth={4} />}
                            </div>
                            <span className={`text-xs font-bold uppercase tracking-tight truncate ${isSelected ? 'text-accent' : 'text-ink'}`}>{unit}</span>
                          </div>
                        </div>
                      );
                    })
                  }
                  {(!unitsByTenant.get(editTenantId.toUpperCase()) || unitsByTenant.get(editTenantId.toUpperCase())?.size === 0) && (
                    <p className="text-[10px] text-ink-muted text-center py-4 uppercase font-bold tracking-widest">Nenhuma unidade encontrada</p>
                  )}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6">
                <div className="flex items-start">
                  <AlertCircle className="text-amber-600 mr-3 shrink-0 mt-0.5" size={18} />
                  <div>
                    <h4 className="text-[10px] font-bold text-amber-800 uppercase tracking-tight">Aviso sobre Senhas</h4>
                    <p className="text-[9px] text-amber-700 mt-1 leading-relaxed">
                      Alterar a senha aqui <strong>NÃO</strong> altera a senha do usuário no Supabase Cloud se ele já estiver ativado. 
                      Para usuários já existentes, utilize o botão <strong>&quot;Enviar Link de Redefinição&quot;</strong> abaixo para que o próprio usuário defina sua nova senha.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Nome Completo</label>
                <div className="relative">
                  <input 
                    type="text" 
                    required 
                    autoComplete="off" 
                    value={editName} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditName(val);
                      // Gerar username automático: primeiro.segundo nome em minúsculo
                      const parts = val.trim().toLowerCase().split(/\s+/);
                      if (parts.length >= 2) {
                        setEditUsername(`${parts[0]}.${parts[1]}`);
                      } else if (parts.length === 1) {
                        setEditUsername(parts[0]);
                      }
                    }} 
                    className="w-full pl-12 pr-6 py-4 bg-bg-main rounded-3xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" 
                    placeholder="Ex: Glaucio Silva" 
                  />
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted/30" size={18} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Senha (Opcional)</label>
                <div className="relative">
                  <input type={showEditPassword ? "text" : "password"} autoComplete="off" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full pl-12 pr-14 py-4 bg-bg-main rounded-3xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" placeholder="Deixe em branco para manter" />
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted/30" size={18} />
                  <button 
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted p-2 hover:text-accent transition-colors"
                  >
                    {showEditPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Perfil de Acesso</label>
                <div className="flex p-1 bg-bg-main rounded-2xl border border-border">
                  <button 
                    type="button"
                    onClick={() => setEditRole(UserRole.AUDITOR)}
                    className={`flex-1 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${editRole === UserRole.AUDITOR ? 'bg-white text-accent shadow-sm border border-border' : 'text-ink-muted'}`}
                  >
                    Auditor
                  </button>
                  {(currentUser?.role === UserRole.ADMIN || currentUser?.email === "semorr@gmail.com") && (
                    <>
                      <button 
                        type="button"
                        onClick={() => setEditRole(UserRole.MASTER)}
                        className={`flex-1 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${editRole === UserRole.MASTER ? 'bg-indigo-600 text-white shadow-sm' : 'text-ink-muted'}`}
                      >
                        Master
                      </button>
                      <button 
                        type="button"
                        onClick={() => setEditRole(UserRole.ADMIN)}
                        className={`flex-1 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${editRole === UserRole.ADMIN ? 'bg-warning text-white shadow-sm' : 'text-ink-muted'}`}
                      >
                        Admin
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Username de Acesso</label>
                <div className="relative">
                  <input 
                    type="text" 
                    required 
                    autoComplete="off" 
                    value={editUsername} 
                    onChange={(e) => setEditUsername(e.target.value.toLowerCase())} 
                    className="w-full pl-12 pr-6 py-4 bg-bg-main rounded-3xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" 
                    placeholder="EX: glaucio.silva" 
                  />
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted/30" size={18} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">E-mail de Acesso</label>
                <div className="relative">
                  <input type="email" required autoComplete="off" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full pl-12 pr-6 py-4 bg-bg-main rounded-3xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted/30" size={18} />
                </div>
              </div>
              <button type="submit" className="w-full py-4 bg-accent text-white rounded-[2rem] font-bold uppercase tracking-[0.2em] shadow-xl shadow-accent/20 active:scale-95 transition-all mt-4 flex items-center justify-center space-x-3">
                <Save size={18} />
                <span className="text-sm">Atualizar Acesso</span>
              </button>

              <div className="pt-4 border-t border-border/50">
                <button 
                  type="button"
                  onClick={handleProvision}
                  disabled={isProvisioning}
                  className="w-full py-4 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-[2rem] font-bold uppercase tracking-[0.2em] active:scale-95 transition-all flex items-center justify-center space-x-3 disabled:opacity-50"
                >
                  {isProvisioning ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Cloud size={18} />
                  )}
                  <span>{isProvisioning ? 'Ativando...' : 'Ativar Acesso Cloud'}</span>
                </button>
                <p className="text-[9px] font-bold text-slate-400 text-center mt-3 uppercase tracking-widest leading-relaxed">
                  Cria o login oficial no Supabase Auth usando o e-mail e senha acima. <br/>
                  <span className="text-amber-600">Nota: Se o e-mail já possuir acesso, a senha não será alterada.</span>
                </p>

                <button 
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isResetting}
                  className="w-full py-3 bg-white border border-border text-ink-muted rounded-2xl font-bold uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center space-x-3 disabled:opacity-50 mt-4"
                >
                  {isResetting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  <span className="text-[10px]">Enviar Link de Redefinição</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Novo Usuário */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative animate-slideUp my-auto modern-card">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-6 right-6 p-3 bg-bg-main border border-border rounded-2xl text-ink-muted hover:text-ink transition-all shadow-sm"><X size={20} /></button>
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-ink uppercase tracking-tight">Novo Inventariante</h3>
              <p className="text-[11px] font-bold text-ink-muted uppercase tracking-widest mt-2">Criação de Username de Acesso</p>
            </div>
            <form onSubmit={handleAddUser} className="space-y-5">
              {/* Grupo Empresarial - Agora no Topo e Fixo */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Grupo Empresarial</label>
                <div className="relative">
                  <input 
                    type="text" 
                    readOnly 
                    value={newTenantId} 
                    className="w-full px-6 py-4 bg-slate-50 rounded-3xl border border-border text-slate-500 font-bold text-sm outline-none cursor-not-allowed" 
                  />
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                </div>
              </div>

              {/* Unidades Operacionais - Filtradas pelo Grupo */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Unidades Operacionais (Permissões)</label>
                <div className="bg-bg-main rounded-[2rem] border border-border p-2 max-h-48 overflow-y-auto space-y-1 no-scrollbar shadow-inner">
                  {Array.from(unitsByTenant.get(newTenantId.toUpperCase()) || new Set<string>())
                    .map((unit: string) => {
                      const isSelected = newUnits.includes(unit);
                      return (
                        <div 
                          key={unit} 
                          onClick={() => {
                            setNewUnits((prev: string[]) => 
                              prev.includes(unit) ? prev.filter((t: string) => t !== unit) : [...prev, unit]
                            );
                          }}
                          className={`flex items-center justify-between p-3 rounded-2xl transition-all cursor-pointer group ${isSelected ? 'bg-accent/5 border border-accent/20' : 'hover:bg-white border border-transparent'}`}
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-accent border-accent text-white shadow-sm' : 'border-border bg-white'}`}>
                              {isSelected && <Check size={14} strokeWidth={4} />}
                            </div>
                            <span className={`text-xs font-bold uppercase tracking-tight truncate ${isSelected ? 'text-accent' : 'text-ink'}`}>{unit}</span>
                          </div>
                        </div>
                      );
                    })
                  }
                  {(!unitsByTenant.get(newTenantId.toUpperCase()) || unitsByTenant.get(newTenantId.toUpperCase())?.size === 0) && (
                    <p className="text-[10px] text-ink-muted text-center py-4 uppercase font-bold tracking-widest">Nenhuma unidade encontrada</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Nome Completo</label>
                <input 
                  type="text" 
                  required 
                  autoComplete="off" 
                  placeholder="EX: Glaucio Silva" 
                  value={newName} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewName(val);
                    // Gerar username automático: primeiro.segundo nome em minúsculo
                    const parts = val.trim().toLowerCase().split(/\s+/);
                    if (parts.length >= 2) {
                      setNewUsername(`${parts[0]}.${parts[1]}`);
                    } else if (parts.length === 1) {
                      setNewUsername(parts[0]);
                    }
                  }} 
                  className="w-full px-6 py-4 bg-bg-main rounded-3xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Username de Acesso</label>
                <input 
                  type="text" 
                  required 
                  autoComplete="off" 
                  placeholder="EX: glaucio.silva" 
                  value={newUsername} 
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase())} 
                  className="w-full px-6 py-4 bg-bg-main rounded-3xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">E-mail de Acesso</label>
                <input type="email" required autoComplete="off" placeholder="usuario@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full px-6 py-4 bg-bg-main rounded-3xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Perfil de Acesso</label>
                <div className="flex p-1 bg-bg-main rounded-2xl border border-border">
                  <button 
                    type="button"
                    onClick={() => setNewRole(UserRole.AUDITOR)}
                    className={`flex-1 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${newRole === UserRole.AUDITOR ? 'bg-white text-accent shadow-sm border border-border' : 'text-ink-muted'}`}
                  >
                    Auditor
                  </button>
                  {(currentUser?.role === UserRole.ADMIN || currentUser?.email === "semorr@gmail.com") && (
                    <>
                      <button 
                        type="button"
                        onClick={() => setNewRole(UserRole.MASTER)}
                        className={`flex-1 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${newRole === UserRole.MASTER ? 'bg-indigo-600 text-white shadow-sm' : 'text-ink-muted'}`}
                      >
                        Master
                      </button>
                      <button 
                        type="button"
                        onClick={() => setNewRole(UserRole.ADMIN)}
                        className={`flex-1 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${newRole === UserRole.ADMIN ? 'bg-warning text-white shadow-sm' : 'text-ink-muted'}`}
                      >
                        Admin
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-2">Senha</label>
                <div className="relative">
                  <input type={showNewPassword ? "text" : "password"} required autoComplete="off" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full pl-6 pr-14 py-4 bg-bg-main rounded-3xl border border-border focus:border-accent focus:bg-white outline-none font-bold text-sm transition-all shadow-sm" />
                  <button 
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted p-2 hover:text-accent transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div 
                className="flex items-center space-x-3 p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100/50 cursor-pointer hover:bg-emerald-50 transition-all" 
                onClick={() => setProvisionOnCreate(!provisionOnCreate)}
              >
                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${provisionOnCreate ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-emerald-200 bg-white'}`}>
                  {provisionOnCreate && <Check size={12} strokeWidth={4} />}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-tight">Ativar Acesso Cloud Imediato</span>
                  <span className="text-[8px] font-medium text-emerald-600/70 uppercase tracking-widest">Cria login no Supabase Auth agora</span>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isProvisioning}
                className="w-full py-4 bg-accent text-white rounded-[2rem] font-bold uppercase tracking-[0.2em] shadow-xl shadow-accent/20 active:scale-95 transition-all mt-4 text-sm flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                {isProvisioning && <Loader2 size={18} className="animate-spin" />}
                <span>{isProvisioning ? 'Ativando Cloud...' : 'Confirmar Cadastro'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="p-8 bg-white border-t border-border flex flex-col items-center">
        <p className="text-[10px] font-bold text-ink-muted/30 uppercase tracking-[0.6em] mb-1">GBR Intelligent Systems</p>
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
