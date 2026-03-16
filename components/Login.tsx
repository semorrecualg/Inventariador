
import React, { useState } from 'react';
import { UserCircle, AlertCircle, Loader2, Server, Cloud, ShieldCheck } from 'lucide-react';
import { getUserPermissions, signIn as supabaseSignIn } from '../services/supabaseService';
import { authenticateWithProtheus } from '../services/protheusService';
import { User, DatabaseMode } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
  onNavigateToRegister: () => void;
  users: User[];
  databaseMode: DatabaseMode;
  onUpdateDatabaseMode: (mode: DatabaseMode) => void;
}

// Ícone SVG Customizado para Ativo Imobilizado
const AssetIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
  >
    <path 
      d="M2 22H22" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
    />
    <path 
      d="M17 22V7L12 2L7 7V22" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinejoin="round" 
    />
    <path 
      d="M7 12H17" 
      stroke="currentColor" 
      strokeWidth="1.5" 
    />
    <path 
      d="M7 17H17" 
      stroke="currentColor" 
      strokeWidth="1.5" 
    />
    <rect 
      x="13" 
      y="13" 
      width="8" 
      height="6" 
      rx="1" 
      fill="white" 
      stroke="currentColor" 
      strokeWidth="1" 
    />
    <path 
      d="M15 15V17" 
      stroke="currentColor" 
      strokeWidth="1" 
    />
    <path 
      d="M17 15V17" 
      stroke="currentColor" 
      strokeWidth="1" 
    />
    <path 
      d="M19 15V17" 
      stroke="currentColor" 
      strokeWidth="1" 
    />
  </svg>
);

const Login: React.FC<LoginProps> = ({ onLogin, onNavigateToRegister, users, databaseMode, onUpdateDatabaseMode }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset loading state when database mode changes to prevent "stuck" UI
  React.useEffect(() => {
    setIsLoading(false);
    setError(null);
  }, [databaseMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    try {
      let loggedUser: User | null = null;

      if (databaseMode === DatabaseMode.PROTHEUS_SUPABASE) {
        // 1. Autentica no Protheus
        const authResult = await authenticateWithProtheus(username.trim(), password);
        
        if (!authResult.success) {
          throw new Error(authResult.message || "Falha na autenticação Protheus.");
        }

        // 2. Busca permissões no Supabase
        const permissions = await getUserPermissions(authResult.user?.email || `${username.trim().toLowerCase()}@gbr.com.br`);
        
        loggedUser = {
          username: authResult.user?.username || username.trim().toUpperCase(),
          email: authResult.user?.email || `${username.trim().toLowerCase()}@gbr.com.br`,
          isAdmin: permissions.isAdmin || false,
          mustChangePassword: false
        };
      } else if (databaseMode === DatabaseMode.SUPABASE) {
        // Autenticação via Supabase Auth
        const signInResult = await supabaseSignIn(username.trim(), password);
        const { user: sbUser } = signInResult;
        
        if (!sbUser) throw new Error("Usuário não encontrado.");

        loggedUser = {
          username: sbUser.user_metadata?.username || sbUser.email?.split('@')[0].toUpperCase() || 'USUÁRIO',
          email: sbUser.email || '',
          isAdmin: sbUser.email?.toLowerCase() === "semorr@gmail.com",
          mustChangePassword: false
        };
      } else {
        // Banco de Dados Interno (Independente)
        const localUser = users.find(u => 
          (u.email.toLowerCase() === username.trim().toLowerCase() || u.username.toLowerCase() === username.trim().toLowerCase()) && 
          u.password === password
        );

        if (!localUser) {
          throw new Error("Credenciais internas inválidas.");
        }

        loggedUser = { ...localUser };
      }

      if (loggedUser) {
        // Salva no localStorage para persistência
        localStorage.setItem('app_current_user', JSON.stringify(loggedUser));
        onLogin(loggedUser);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Erro ao autenticar. Verifique seus dados.");
    } finally {
      setIsLoading(false);
    }
  };

  const getFieldConfig = () => {
    switch (databaseMode) {
      case DatabaseMode.PROTHEUS_SUPABASE:
        return {
          userLabel: "Usuário Protheus",
          userPlaceholder: "MATRÍCULA OU USUÁRIO ERP",
          passLabel: "Senha ERP",
          passPlaceholder: "••••••••",
          accentColor: "text-accent",
          focusColor: "focus:border-accent"
        };
      case DatabaseMode.SUPABASE:
        return {
          userLabel: "E-mail Cloud",
          userPlaceholder: "SEU-EMAIL@EXEMPLO.COM",
          passLabel: "Senha Cloud",
          passPlaceholder: "••••••••",
          accentColor: "text-accent",
          focusColor: "focus:border-accent"
        };
      default:
        return {
          userLabel: "Usuário / E-mail",
          userPlaceholder: "DIGITE SEU USUÁRIO OU E-MAIL",
          passLabel: "Senha",
          passPlaceholder: "••••••••",
          accentColor: "text-accent",
          focusColor: "focus:border-accent"
        };
    }
  };

  const config = getFieldConfig();

  return (
    <div className="p-4 h-full flex flex-col justify-start animate-fadeIn bg-bg-main overflow-y-auto no-scrollbar pt-2">
      {/* Header compactado e movido para cima (X) */}
      <div className="mb-3 text-center">
        <div className="relative w-24 h-24 mx-auto mb-2">
          {/* Ícone SVG Customizado de Ativo Imobilizado */}
          <div className="absolute inset-0 bg-accent rounded-3xl shadow-xl transform -rotate-3 opacity-20"></div>
          <div className="absolute inset-0 bg-white rounded-3xl shadow-lg flex items-center justify-center transform rotate-3 transition-transform hover:rotate-0 overflow-hidden border border-accent-soft">
            <AssetIcon className="w-14 h-14 text-accent" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-accent w-4 h-4 rounded-full border-2 border-white shadow-sm"></div>
        </div>
        <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">
          GBR <span className="text-accent">AUDITORIA</span>
        </h1>
        <p className="text-slate-400 text-[8px] font-bold uppercase tracking-[0.2em] mt-1">
          INVENTÁRIO DE ATIVO IMOBILIZADO
        </p>
      </div>

      <div className="mb-3 max-w-sm mx-auto w-full">
        <p className="text-[9px] font-bold text-ink-muted uppercase tracking-[0.2em] mb-2 ml-1">Modalidade de Acesso</p>
        <div className="flex p-1 bg-accent-soft rounded-2xl border border-accent/10">
          <button 
            onClick={() => onUpdateDatabaseMode(DatabaseMode.INTERNAL)}
            className={`flex-1 py-2.5 rounded-xl text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${databaseMode === DatabaseMode.INTERNAL ? 'bg-white text-accent shadow-sm' : 'text-ink-muted'}`}
          >
            <Server size={12} />
            <span>Interno</span>
          </button>
          <button 
            onClick={() => onUpdateDatabaseMode(DatabaseMode.SUPABASE)}
            className={`flex-1 py-2.5 rounded-xl text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${databaseMode === DatabaseMode.SUPABASE ? 'bg-white text-accent shadow-sm' : 'text-ink-muted'}`}
          >
            <Cloud size={12} />
            <span>Supabase</span>
          </button>
          <button 
            onClick={() => onUpdateDatabaseMode(DatabaseMode.PROTHEUS_SUPABASE)}
            className={`flex-1 py-2.5 rounded-xl text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${databaseMode === DatabaseMode.PROTHEUS_SUPABASE ? 'bg-white text-accent shadow-sm' : 'text-ink-muted'}`}
          >
            <ShieldCheck size={12} />
            <span>Protheus</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5 max-w-sm mx-auto w-full">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-xl text-[9px] font-bold uppercase flex items-center mb-3 tracking-widest shadow-sm">
            <AlertCircle size={14} className="mr-2 shrink-0" />
            {error}
          </div>
        )}
        
        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-ink-muted uppercase tracking-[0.1em] ml-1">{config.userLabel}</label>
          <div className="relative">
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 rounded-xl border border-accent/10 bg-white ${config.focusColor} outline-none transition-all text-ink font-bold shadow-sm text-sm`}
              placeholder={config.userPlaceholder}
            />
            <UserCircle className="absolute left-3.5 top-1/2 -translate-y-1/2 text-accent/30" size={18} />
          </div>
        </div>
        
        <div className="space-y-1 animate-fadeIn">
          <label className="block text-[9px] font-bold text-ink-muted uppercase tracking-[0.1em] ml-1">{config.passLabel}</label>
          <input 
            type="password" 
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full px-4 py-3 rounded-xl border border-accent/10 bg-white ${config.focusColor} outline-none transition-all text-ink font-bold shadow-sm text-sm`}
            placeholder={config.passPlaceholder}
          />
        </div>

        <button 
          type="submit"
          disabled={isLoading}
          className="w-full bg-accent text-white font-bold py-3.5 rounded-xl shadow-md active:scale-[0.98] transition-all mt-4 uppercase tracking-[0.1em] text-xs flex items-center justify-center space-x-2 disabled:opacity-70"
        >
          {isLoading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Autenticando...</span>
            </>
          ) : (
            <span>Acessar Sistema</span>
          )}
        </button>
      </form>

      <div className="mt-6 text-center space-y-3">
        <div>
          {databaseMode === DatabaseMode.INTERNAL ? (
            <div className="space-y-2">
              <div className="bg-accent-soft p-2.5 rounded-xl border border-accent/10">
                <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest leading-relaxed">
                  <span className="text-accent">Auditores:</span> Solicitem suas credenciais ao Administrador.
                </p>
              </div>
              <button 
                onClick={onNavigateToRegister}
                className="text-ink-muted font-bold uppercase text-[9px] tracking-widest hover:text-accent transition-colors"
              >
                Administradores: <span className="underline">Registrar Unidade</span>
              </button>
            </div>
          ) : databaseMode === DatabaseMode.SUPABASE ? (
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-ink-muted uppercase tracking-widest">Novo no sistema Cloud?</p>
              <button 
                onClick={onNavigateToRegister}
                className="text-accent font-bold uppercase text-[10px] tracking-widest hover:underline"
              >
                Cadastre-se Agora
              </button>
            </div>
          ) : (
            <div className="pt-1">
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest">Acesso Restrito ERP Protheus</p>
            </div>
          )}
        </div>
        
        <div className="pt-3 border-t border-accent/10">
          <p className="text-[8px] font-bold text-ink-muted uppercase tracking-[0.3em]">
            GBR Intelligent Systems
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
