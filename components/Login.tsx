
import React, { useState } from 'react';
import { UserCircle, AlertCircle, Loader2, Server, Cloud, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { getUserPermissions, supabase, ensureUserProfile } from '../services/supabaseService';
import { authenticateWithProtheus } from '../services/protheusService';
import { User, DatabaseMode, UserRole } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
  onNavigateToRegister: () => void;
  users: User[];
  databaseMode: DatabaseMode;
  onUpdateDatabaseMode: (mode: DatabaseMode) => void;
}

// Login Component
const Login: React.FC<LoginProps> = ({ onLogin, onNavigateToRegister, users, databaseMode, onUpdateDatabaseMode }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset loading state when database mode changes to prevent "stuck" UI
  React.useEffect(() => {
    setIsLoading(false);
    setError(null);
  }, [databaseMode]);

  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleMagicLink = async () => {
    if (!username.includes('@')) {
      setError("Por favor, insira um e-mail válido para o Magic Link.");
      return;
    }

    setError(null);
    setIsMagicLinkLoading(true);
    try {
      const { error } = await supabase!.auth.signInWithOtp({
        email: username.trim().toLowerCase(),
        options: {
          emailRedirectTo: window.location.origin,
        }
      });

      if (error) throw error;
      setMagicLinkSent(true);
    } catch (err: unknown) {
      const error = err as Error;
      setError(`Erro ao enviar link: ${error.message}`);
    } finally {
      setIsMagicLinkLoading(false);
    }
  };

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
        const permissions = await getUserPermissions(authResult.user?.email || `${username.trim().toLowerCase()}@gbr.com`);
        
        loggedUser = {
          username: authResult.user?.username || username.trim(),
          email: authResult.user?.email || `${username.trim().toLowerCase()}@gbr.com`,
          role: permissions.isAdmin ? UserRole.ADMIN : UserRole.AUDITOR,
          isAdmin: permissions.isAdmin || false,
          mustChangePassword: false,
          tenantId: permissions.tenantId || 'default'
        };
      } else if (databaseMode === DatabaseMode.SUPABASE) {
        // 1. Autenticação via Supabase Auth (Oficial)
        const { data: authData, error: authError } = await supabase!.auth.signInWithPassword({
          email: username.trim().toLowerCase(),
          password: password
        });

        if (authError) {
          // Se falhar no Auth, mostramos a mensagem real do Supabase para diagnóstico
          if (authError.message.includes("Email not confirmed")) {
            throw new Error("E-mail ainda não confirmado. Verifique sua caixa de entrada ou confirme manualmente no painel do Supabase.");
          }
          if (authError.message.includes("Invalid login credentials")) {
            throw new Error("E-mail ou senha incorretos no Supabase.");
          }
          throw new Error(`Erro Supabase: ${authError.message}`);
        }
        
        if (!authData.user) throw new Error("Falha ao recuperar dados do usuário.");

        // 2. Garante que o usuário tenha um perfil na tabela user_permissions
        const cloudUser = await ensureUserProfile(authData.user.email!, authData.user.user_metadata);
        
        loggedUser = {
          username: cloudUser.username,
          email: cloudUser.email,
          role: cloudUser.role as UserRole,
          isAdmin: cloudUser.isAdmin,
          mustChangePassword: false,
          tenantId: cloudUser.tenantId || 'default',
          tenants: cloudUser.tenants || [cloudUser.tenantId || 'default']
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
          {/* Logo AI AUDITPRO */}
          <div className="absolute inset-0 bg-accent rounded-3xl shadow-xl transform -rotate-3 opacity-20"></div>
          <div className="absolute inset-0 bg-white rounded-3xl shadow-lg flex items-center justify-center transform rotate-3 transition-transform hover:rotate-0 overflow-hidden border border-accent-soft p-1">
            <img 
              src="/logo.png" 
              alt="AI AUDITPRO Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement?.classList.add('bg-accent-soft');
                const logoFallback = document.createElement('img');
                logoFallback.src = 'https://picsum.photos/seed/gbr/200/200';
                logoFallback.className = 'w-full h-full object-contain';
                e.currentTarget.parentElement?.appendChild(logoFallback);
              }}
            />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-accent w-4 h-4 rounded-full border-2 border-white shadow-sm"></div>
        </div>
        <h1 className="text-xl font-black text-ink tracking-tighter uppercase italic leading-none">
          GBR <span className="text-accent">AUDITORIA</span>
        </h1>
        <p className="text-ink-muted text-[8px] font-bold uppercase tracking-[0.2em] mt-1">
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
          <div className="relative">
            <input 
              type={showPassword ? "text" : "password"} 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border border-accent/10 bg-white ${config.focusColor} outline-none transition-all text-ink font-bold shadow-sm text-sm pr-12`}
              placeholder={config.passPlaceholder}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-accent/40 hover:text-accent transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button 
          type="submit"
          disabled={isLoading || isMagicLinkLoading}
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

        {databaseMode === DatabaseMode.SUPABASE && (
          <div className="pt-2">
            {magicLinkSent ? (
              <div className="bg-green-50 border border-green-100 text-green-700 p-3 rounded-xl text-[10px] font-bold uppercase text-center animate-fadeIn">
                Link enviado! Verifique seu e-mail. <br/>
                <span className="text-[8px] opacity-80 mt-1 block">O link expira em 5 minutos e só pode ser usado uma vez.</span>
              </div>
            ) : (
              <button 
                type="button"
                onClick={handleMagicLink}
                disabled={isMagicLinkLoading || isLoading}
                className="w-full bg-white border border-accent/20 text-accent font-bold py-3 rounded-xl active:scale-[0.98] transition-all uppercase tracking-[0.1em] text-[10px] flex items-center justify-center space-x-2 disabled:opacity-70"
              >
                {isMagicLinkLoading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Enviando Link...</span>
                  </>
                ) : (
                  <>
                    <Cloud size={12} />
                    <span>Entrar sem senha (Magic Link)</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
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
          <p className="text-[8px] font-bold text-accent uppercase tracking-[0.3em]">
            GBR Intelligent Systems
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
