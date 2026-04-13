
import React, { useState } from 'react';
import { UserCircle, AlertCircle, Loader2, Server, Cloud, Eye, EyeOff, RefreshCw, ShieldCheck, Fingerprint } from 'lucide-react';
import { supabase, ensureUserProfile, resetPassword, logAuditEvent, getEmailByUsername, signInWithMagicLink } from '../services/supabaseService';
import { authenticateBiometric, hasBiometricRegistered, isBiometricSupported } from '../services/biometricService';
import { User, DatabaseMode, UserRole, AppScreen } from '../types';
import { getAppBaseUrl } from '../utils/urlUtils';
import { safeStringify } from '../services/utils';

interface LoginProps {
  onLogin: (user: User) => void;
  users: User[];
  databaseMode: DatabaseMode;
  onUpdateDatabaseMode: (mode: DatabaseMode) => void;
  onOpenPrivacyCenter: () => void;
}

// Login Component
const Login: React.FC<LoginProps> = ({ onLogin, users, databaseMode, onUpdateDatabaseMode, onOpenPrivacyCenter }) => {
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

  const [isResetting, setIsResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [manualLink, setManualLink] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [hasBio, setHasBio] = useState(false);

  // Check for biometrics when username changes
  React.useEffect(() => {
    const checkBio = async () => {
      if (username.length > 3) {
        const supported = await isBiometricSupported();
        if (supported) {
          const registered = await hasBiometricRegistered(username.trim().toLowerCase());
          setHasBio(registered);
        } else {
          setHasBio(false);
        }
      } else {
        setHasBio(false);
      }
    };
    checkBio();
  }, [username]);

  const handleBiometricLogin = async () => {
    if (!username) return;
    
    try {
      setIsLoading(true);
      const success = await authenticateBiometric(username.trim().toLowerCase());
      
      if (success) {
        // No modo INTERNO, buscamos o usuário local
        const localUser = users.find(u => 
          u.email.toLowerCase() === username.trim().toLowerCase() || 
          u.username.toLowerCase() === username.trim().toLowerCase()
        );

        if (localUser) {
          localStorage.setItem('app_current_user', safeStringify(localUser));
          
          // Log de Auditoria
          logAuditEvent({
            user_email: localUser.email,
            action: 'LOGIN',
            details: 'Login efetuado via Biometria (Local)',
            _tenantid: localUser._tenantid || localUser.tenantid
          });

          onLogin(localUser);
        } else {
          setError("Usuário biométrico não encontrado no banco local.");
        }
      }
    } catch {
      setError("Falha na autenticação biométrica.");
    } finally {
      setIsLoading(false);
    }
  };

  // Detectar erro de OTP expirado na URL
  React.useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('error_code=otp_expired')) {
      setError("O link do e-mail expirou ou já foi usado. Por favor, solicite um NOVO link abaixo.");
      // Limpa o hash para não ficar mostrando o erro se o usuário tentar outras coisas
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const handleManualLogin = async () => {
    if (!manualLink.includes('#access_token=')) {
      setError("Link inválido. Copie o link completo que deu erro (localhost).");
      return;
    }
    
    try {
      setIsLoading(true);
      // Extrai o hash do link (tudo após o #)
      const hash = manualLink.split('#')[1];
      const { data, error } = await supabase!.auth.setSession({
        access_token: new URLSearchParams(hash).get('access_token') || '',
        refresh_token: new URLSearchParams(hash).get('refresh_token') || '',
      });

      if (error) throw error;
      if (data.user) {
        const cloudUser = await ensureUserProfile(data.user.email!, data.user.user_metadata, data.user.id);
        const loggedUser: User = {
          id: data.user.id,
          username: cloudUser.username,
          email: cloudUser.email,
          role: cloudUser.role as UserRole,
          is_admin: cloudUser.is_admin || cloudUser.isAdmin || false,
          isAdmin: cloudUser.is_admin || cloudUser.isAdmin || false,
          mustChangePassword: false,
          _tenantid: cloudUser._tenantid || cloudUser.tenantid || '',
          tenantid: cloudUser._tenantid || cloudUser.tenantid || '',
          tenants: cloudUser.tenants || [cloudUser.tenantid || '']
        };
        localStorage.setItem('app_current_user', safeStringify(loggedUser));
        onLogin(loggedUser);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError("Erro ao processar link manual: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!username || !username.includes('@')) {
      setError("Digite seu e-mail para redefinir a senha.");
      return;
    }
    setIsResetting(true);
    setError("");
    try {
      await resetPassword(username.trim().toLowerCase());
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (err) {
      const error = err as { message?: string };
      setError(error.message || "Erro ao enviar e-mail de redefinição.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleClearSession = async () => {
    try {
      setIsLoading(true);
      if (supabase) {
        await supabase.auth.signOut();
      }
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    } catch (err) {
      console.error('Erro ao limpar sessão:', err);
      window.location.reload();
    }
  };

  const handleMagicLink = async () => {
    if (!username.includes('@')) {
      setError("Por favor, insira um e-mail válido para o Magic Link.");
      return;
    }

    setError(null);
    setIsMagicLinkLoading(true);
    
    try {
      await signInWithMagicLink(username.trim().toLowerCase());
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
    console.log('[Login] Iniciando autenticação...', { databaseMode, username });
    
    if (databaseMode === DatabaseMode.SUPABASE && !supabase) {
      setIsLoading(false);
      setError("O Supabase não está configurado. Verifique as variáveis de ambiente (URL e Anon Key) nas configurações do projeto.");
      return;
    }
    
    // Timeout de segurança para não travar a UI (Aumentado para 45s para maior resiliência)
    const loginTimeout = setTimeout(() => {
      setIsLoading(prev => {
        if (prev) {
          setError("A autenticação está demorando muito. Verifique sua conexão ou tente novamente.");
          console.warn('[Login] Timeout de autenticação atingido (45s).');
          return false;
        }
        return prev;
      });
    }, 45000);

    try {
      let loggedUser: User | null = null;

      if (databaseMode === DatabaseMode.SUPABASE) {
        console.log('[Login] Autenticando via Supabase Auth...', { loginEmail: username.trim().toLowerCase() });
        
        let loginEmail = username.trim().toLowerCase();
        
        // Se não for um e-mail, tenta buscar o e-mail pelo username
        if (!loginEmail.includes('@')) {
          console.log('[Login] Username detectado, buscando e-mail correspondente...');
          const foundEmail = await getEmailByUsername(username.trim());
          if (!foundEmail) {
            throw new Error("Username não encontrado. Verifique se digitou corretamente ou use seu e-mail.");
          }
          loginEmail = foundEmail;
          console.log('[Login] E-mail encontrado:', loginEmail);
        }

        console.log('[Login] Chamando signInWithPassword com timeout...');
        // 1. Autenticação via Supabase Auth (Oficial) com timeout de 10s
        const signInPromise = supabase!.auth.signInWithPassword({
          email: loginEmail,
          password: password
        });

        const authResult = await Promise.race([
          signInPromise,
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 30000))
        ]).catch(err => {
          console.error('[Login] Erro ou Timeout no Auth:', err.message);
          if (err.message === "AUTH_TIMEOUT") {
            throw new Error("O servidor de autenticação está demorando muito para responder. Isso pode ser instabilidade na rede ou o servidor acordando. Tente novamente em alguns instantes.");
          }
          throw err;
        }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

        if (authResult.error) {
          console.error('[Login] Erro Supabase Auth:', authResult.error);
          throw authResult.error;
        }
        
        const authData = authResult.data;
        if (!authData.user) throw new Error("Falha ao recuperar dados do usuário.");

        // 2. Garante que o usuário tenha um perfil na tabela user_permissions
        console.log('[Login] Chamando ensureUserProfile...');
        const cloudUser = await ensureUserProfile(authData.user.email!, authData.user.user_metadata, authData.user.id)
          .catch(err => {
            console.warn('[Login] Erro ao garantir perfil, usando dados básicos:', err);
            const is_master = (authData.user.email?.toLowerCase() === 'semorr@gmail.com' || authData.user.email?.toLowerCase() === 'semorr@gmail.com.br');
            return {
              email: authData.user.email,
              username: authData.user.email?.split('@')[0],
              role: is_master ? 'ADMIN' : 'AUDITOR',
              is_admin: is_master,
              _tenantid: is_master ? 'CICOPAL' : '',
              _unitid: is_master ? 'MATRIZ' : ''
            };
          });
        
        console.log('[Login] Perfil processado.');
        
        // Se o usuário logou com username, garantimos que o objeto User tenha esse username
        const finalUsername = !username.includes('@') ? username.trim() : (cloudUser.username || authData.user.email!.split('@')[0]);

        const normalizeValue = (val: string) => {
          if (!val) return '';
          const upper = val.toUpperCase();
          return (upper === 'DEFAULT' || upper === 'NULL' || upper === '0' || upper === 'default') ? '' : val;
        };

        const normalizeArray = (arr: unknown[]) => {
          if (!arr) return [];
          return arr.map(v => String(v)).filter(v => normalizeValue(v) !== '');
        };

        const is_master = (cloudUser.email.toLowerCase() === 'semorr@gmail.com' || cloudUser.email.toLowerCase() === 'semorr@gmail.com.br');
        const is_admin = cloudUser.is_admin || cloudUser.isAdmin || cloudUser.role === 'ADMIN' || cloudUser.role === 'MASTER' || is_master;

        let tenantId = normalizeValue(cloudUser._tenantid || cloudUser.tenantid || '');
        let unitId = normalizeValue(cloudUser._unitid || cloudUser.unitid || '');

        if (is_master) {
          if (!tenantId) tenantId = 'CICOPAL';
          if (!unitId) unitId = 'MATRIZ';
        }

        loggedUser = {
          username: finalUsername,
          name: cloudUser.name || finalUsername,
          email: cloudUser.email,
          role: cloudUser.role as UserRole,
          is_admin: is_admin,
          isAdmin: is_admin,
          mustChangePassword: false,
          _tenantid: tenantId,
          _unitid: unitId,
          tenantid: tenantId,
          unitid: unitId,
          units: normalizeArray(cloudUser.units || (unitId ? [unitId] : [])),
          tenants: normalizeArray(cloudUser.tenants || (tenantId ? [tenantId] : []))
        };
      } else {
        console.log('[Login] Autenticando via Banco Interno (Mobile Puro)...');
        // Isolamento Total: No modo Mobile Puro, a autenticação é 100% local.
        const localUser = users.find(u => 
          (u.email.toLowerCase() === username.trim().toLowerCase() || u.username.toLowerCase() === username.trim().toLowerCase()) && 
          u.password === password
        );

        if (!localUser) {
          // Fallback para admin padrão apenas se for o usuário mestre configurado localmente
          const isAdminFallback = (username.trim().toLowerCase() === 'admin gbr' || username.trim().toLowerCase() === 'semorr@gmail.com') && password === 'admin';
          
          if (isAdminFallback) {
            const adminUser = users.find(u => u.email.toLowerCase() === 'semorr@gmail.com');
            if (adminUser) {
              loggedUser = { ...adminUser };
            }
          }
          
          if (!loggedUser) {
            throw new Error("Credenciais internas inválidas. O modo 'Mobile Puro' é 100% local e não reconhece contas da nuvem.");
          }
        } else {
          loggedUser = { ...localUser };
        }
      }

      if (loggedUser) {
        console.log('[Login] Sucesso! Sessão local gerada para:', loggedUser.email);
        
        // Salva no localStorage para persistência (Token Local)
        localStorage.setItem('app_current_user', safeStringify(loggedUser));
        
        // Log de Auditoria Local
        logAuditEvent({
          user_email: loggedUser.email,
          action: 'LOGIN',
          details: `Login efetuado via ${databaseMode === DatabaseMode.SUPABASE ? 'Nuvem' : 'Banco Interno (Isolado)'}`,
          _tenantid: loggedUser._tenantid || loggedUser.tenantid
        });

        onLogin(loggedUser);
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error('[Login] Erro durante o processo:', error);
      setError(error.message || "Erro ao autenticar. Verifique seus dados.");
    } finally {
      clearTimeout(loginTimeout);
      setIsLoading(false);
    }
  };

  const getFieldConfig = () => {
    switch (databaseMode) {
      case DatabaseMode.SUPABASE:
        return {
          userLabel: "Username ou E-mail",
          userPlaceholder: "SEU USUÁRIO OU E-MAIL",
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
      <div className="mb-3 text-center relative">
        {/* Indicador de Plataforma */}
        <div className="absolute -top-1 right-0 bg-accent-soft px-2 py-0.5 rounded-full border border-accent/10">
          <span className="text-[6px] font-black text-accent uppercase tracking-widest">
            {databaseMode === DatabaseMode.INTERNAL ? 'MOBILE' : (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 'MOBILE' : 'DESKTOP')}
          </span>
        </div>
        
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
          SISTEMA <span className="text-accent">AUDITORIA</span>
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
            <span>Mobile Puro</span>
          </button>
          <button 
            onClick={() => onUpdateDatabaseMode(DatabaseMode.SUPABASE)}
            className={`flex-1 py-2.5 rounded-xl text-[8px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center space-y-1 ${databaseMode === DatabaseMode.SUPABASE ? 'bg-white text-accent shadow-sm' : 'text-ink-muted'}`}
          >
            <Cloud size={12} />
            <span>Cloud Sync</span>
          </button>
        </div>

        {databaseMode === DatabaseMode.INTERNAL && users.length <= 1 && (
          <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded-xl animate-pulse">
            <p className="text-[7px] font-black text-amber-700 uppercase tracking-tighter leading-tight text-center">
              ⚠️ Cache limpo detectado. No modo &quot;Mobile Puro&quot;, apenas o administrador padrão está disponível. 
              Use &quot;Cloud Sync&quot; para restaurar seu acesso e baixar os dados.
            </p>
          </div>
        )}
        
        {/* Botão de Emergência para Limpar Cache */}
        <button 
          type="button"
          onClick={() => {
            if (window.confirm('Isso vai limpar todo o cache do navegador e deslogar você. Deseja continuar?')) {
              localStorage.clear();
              sessionStorage.clear();
              // Tenta desregistrar service workers
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(registrations => {
                  for (const registration of registrations) {
                    registration.unregister();
                  }
                });
              }
              window.location.reload();
            }
          }}
          className="w-full mt-2 py-1.5 border border-red-200 bg-red-50 text-red-600 rounded-xl text-[7px] font-black uppercase tracking-[0.2em] hover:bg-red-100 transition-colors flex items-center justify-center space-x-2"
        >
          <RefreshCw size={10} className="animate-spin-slow" />
          <span>Forçar Limpeza de Cache (Emergência)</span>
        </button>
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
          <>
            <button 
              type="button"
              onClick={() => {
                // Navega para a tela de registro
                const pushScreen = window.pushScreen;
                if (pushScreen) {
                  pushScreen(AppScreen.REGISTER);
                } else {
                  // Fallback se pushScreen não estiver no window
                  window.dispatchEvent(new CustomEvent('app_navigate', { detail: AppScreen.REGISTER }));
                }
              }}
              className="w-full bg-white border border-accent text-accent font-bold py-3.5 rounded-xl shadow-sm active:scale-[0.98] transition-all mt-2 uppercase tracking-[0.1em] text-xs flex items-center justify-center space-x-2"
            >
              <span>Criar Nova Conta</span>
            </button>

            {/* Botão de Limpar Sessão (Recuperação) - Movido para maior visibilidade */}
            <button
              type="button"
              onClick={handleClearSession}
              className="w-full py-2 px-4 text-[9px] text-gray-400 hover:text-gray-600 flex items-center justify-center gap-2 transition-colors mt-2"
              title="Use se o login estiver travado ou se mudou de projeto"
            >
              <RefreshCw className="w-3 h-3" />
              Limpar Sessão e Cache (Recuperação)
            </button>
          </>
        )}

        {hasBio && !isLoading && (
          <button 
            type="button"
            onClick={handleBiometricLogin}
            className="w-full bg-white border-2 border-accent text-accent font-bold py-3.5 rounded-xl shadow-sm active:scale-[0.98] transition-all mt-2 uppercase tracking-[0.1em] text-xs flex items-center justify-center space-x-2"
          >
            <Fingerprint size={18} />
            <span>Entrar com Biometria</span>
          </button>
        )}

        {databaseMode === DatabaseMode.SUPABASE && (
          <div className="pt-2 space-y-2">
            <button 
              type="button"
              onClick={handleResetPassword}
              disabled={isResetting || isLoading}
              className="w-full text-[9px] font-bold text-accent hover:text-accent-dark uppercase tracking-widest transition-colors flex items-center justify-center py-1"
            >
              {isResetting ? <RefreshCw size={10} className="mr-1 animate-spin" /> : <RefreshCw size={10} className="mr-1" />}
              {resetSent ? "E-mail de redefinição enviado!" : "Esqueci minha senha"}
            </button>

            {supabase && (
              magicLinkSent ? (
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
              )
            )}
          </div>
        )}
      </form>

      <div className="mt-6 text-center space-y-3">
        <div>
          {databaseMode === DatabaseMode.INTERNAL ? (
            <div className="bg-accent-soft p-2.5 rounded-xl border border-accent/10">
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest leading-relaxed">
                <span className="text-accent">Auditores:</span> Solicitem suas credenciais ao Administrador.
              </p>
            </div>
          ) : (
            <div className="bg-accent-soft p-2.5 rounded-xl border border-accent/10">
              <p className="text-[8px] font-bold text-ink-muted uppercase tracking-widest leading-relaxed">
                Acesso restrito a auditores autorizados. <br/>
                <span className="text-accent">Consulte seu Administrador.</span>
              </p>
            </div>
          )}

          {/* Link de Resgate (Bypass para erro de localhost) - Disponível apenas se Supabase estiver configurado */}
          {databaseMode !== DatabaseMode.INTERNAL && supabase && (
            <div className="mt-4 pt-4 border-t border-accent/10">
              {!showManualInput ? (
                <button
                  type="button"
                  onClick={() => setShowManualInput(true)}
                  className="text-[9px] font-bold text-ink-muted hover:text-accent flex items-center justify-center gap-1 mx-auto uppercase tracking-widest"
                >
                  <AlertCircle size={12} />
                  Problemas com o link do e-mail?
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 text-center">
                    Se o link do e-mail abriu uma página de erro (localhost), copie o link completo da barra de endereços e cole abaixo:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualLink}
                      onChange={(e) => setManualLink(e.target.value)}
                      placeholder="Cole o link do localhost aqui..."
                      className="flex-1 text-xs p-2 border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleManualLogin}
                      disabled={isLoading}
                      className="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isLoading ? '...' : 'Logar'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowManualInput(false)}
                    className="text-[10px] text-gray-400 hover:underline block mx-auto"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="pt-3 border-t border-accent/10">
          <p className="text-[8px] font-bold text-accent uppercase tracking-[0.3em]">
            AUDITORIA INTELIGENTE
          </p>
          <button 
            onClick={onOpenPrivacyCenter}
            className="mt-2 text-[8px] font-bold text-ink-muted uppercase tracking-widest hover:text-accent transition-colors flex items-center justify-center mx-auto space-x-1"
          >
            <ShieldCheck size={10} />
            <span>Privacidade e Segurança</span>
          </button>
          <p className="text-[7px] text-slate-400 mt-1 font-mono opacity-40">
            URL: {getAppBaseUrl()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
