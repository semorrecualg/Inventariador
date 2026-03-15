
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { 
  ArrowLeft, 
  Shield, 
  UserCircle,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../services/supabaseService';

interface UserManagementProps {
  onBack: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ onBack }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch users from Supabase profiles table
  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('username', { ascending: true });

      if (error) throw error;

      if (data) {
        setUsers(data.map(d => ({
          username: d.username,
          email: d.email,
          isAdmin: d.is_admin,
          mustChangePassword: false
        })));
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

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
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Usuários cadastrados no sistema</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-32 no-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <RefreshCw size={40} className="text-blue-500 animate-spin" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carregando Usuários...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-400 text-sm font-bold uppercase">Nenhum usuário encontrado.</p>
          </div>
        ) : (
          users.map((u) => (
            <div 
              key={u.email} 
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
                <ChevronRight size={20} className="text-slate-200 group-hover:hidden" />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-8 bg-white border-t border-slate-200 flex flex-col items-center">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.6em] mb-1">GBR Intelligent Systems</p>
      </div>
    </div>
  );
};



export default UserManagement;
