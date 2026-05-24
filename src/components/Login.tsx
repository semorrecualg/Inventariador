
import React, { useState } from 'react';
import { UserCircle, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck, Fingerprint, ShieldAlert } from 'lucide-react';
import { supabase, ensureUserProfile, logAuditEvent, getEmailByUsername } from '../services/supabaseService';
import { authenticateBiometric, hasBiometricRegistered, isBiometricSupported } from '../services/biometricService';
import { User, DatabaseMode, UserRole, AppScreen, ModalConfig } from '../types';
import { APP_LOGO } from '../constants';
import { safeStringify } from '../services/utils';
import { localDb } from '../services/localDbService';

interface LoginProps {
  onLogin: (user: User) => void;
  users: User[];
  databaseMode: DatabaseMode;
  onOpenPrivacyCenter: () => void;
  onUpdateScreen: (screen: AppScreen) => void;
  onShowModal: (config: Partial<ModalConfig>) => void;
  isDatabaseEmpty?: boolean;
  isKeyboardVisible?: boolean;
}

// Login Component
const Login: React.FC<LoginProps> = ({ 
  onLogin, 
  users, 
  databaseMode, 
  onOpenPrivacyCenter, 
  onUpdateScreen, 
  onShowModal,
  isDatabaseEmpty = false,
  isKeyboardVisible = false
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clickCount, setClickCount] = useState(0);

  // Reset loading state when database mode changes to prevent "stuck" UI
  React.useEffect(() => {
    setIsLoading(false);
    setError(null);
  }, [databaseMode]);

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

  const handleClearSession = async () => {
    onShowModal({
      title: 'Redefinir Acesso Local',
      message: 'Esta ação deslogará o usuário e redefinirá as configurações de acesso. Seus dados de auditoria salvos no SQLite permanecerão intactos. Deseja continuar?',
      type: 'confirm',
      showCancel: true,
      confirmText: 'Redefinir Agora',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        try {
          setIsLoading(true);
          if (supabase) {
            await supabase.auth.signOut();
          }
          
          // Limpeza Seletiva (Truncate de tabelas temporárias/logs)
          await Promise.all([
            localDb.auditLogs.clear(),
            localDb.unitConfigs.clear()
          ]);

          // Remove apenas chaves de estado, preservando o banco de ativos se possível
          const keysToKeep = ['app_database_mode', 'inventory_assets_v24_internal_secure', 'inventory_assets_v24_supabase_secure'];
          const allKeys = Object.keys(localStorage);
          allKeys.forEach(key => {
            if (!keysToKeep.some(k => key.includes(k))) {
              localStorage.removeItem(key);
            }
          });

          sessionStorage.clear();
          window.location.reload();
        } catch (err) {
          console.error('Erro ao limpar sessão:', err);
          window.location.reload();
        }
      }
    });
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
      const isEmail = username.trim().includes('@');
      const isOnline = navigator.onLine;
      let attemptSupabase = false;

      if (isOnline && (databaseMode === DatabaseMode.SUPABASE || isEmail)) {
        attemptSupabase = true;
      }

      const doLocalAuthFallback = (): User => {
        console.log('[Login] Autenticando via Banco Interno (Mobile Puro - Fallback)...');
        const localUser = users.find(u => 
          (u.email.toLowerCase() === username.trim().toLowerCase() || u.username.toLowerCase() === username.trim().toLowerCase()) && 
          u.password === password
        );

        if (!localUser) {
          // Fallback para admin padrão apenas se for o usuário mestre configurado localmente
          const isAdminFallback = (username.trim().toLowerCase() === 'admin gbr' || username.trim().toLowerCase() === 'semorr@gmail.com' || username.trim().toLowerCase() === 'admin') && 
                                  (password === 'admin' || password === 'Glaucio@1970');
          
          if (isAdminFallback) {
            const adminUser = users.find(u => u.email.toLowerCase() === 'semorr@gmail.com');
            if (adminUser) {
              return { ...adminUser };
            }
          }
          
          throw new Error("Credenciais internas inválidas. O modo 'Mobile Puro' é 100% local e não reconhece contas da nuvem.");
        }
        return { ...localUser };
      };

      if (attemptSupabase) {
        console.log('[Login] Autenticando via Supabase Auth (Soberania de Rede)...', { loginEmail: username.trim().toLowerCase() });
        
        let loginEmail = username.trim().toLowerCase();
        
        // Se não for um e-mail, tenta buscar o e-mail pelo username
        if (!loginEmail.includes('@')) {
          console.log('[Login] Username detectado, buscando e-mail correspondente para a Nuvem...');
          const foundEmail = await getEmailByUsername(username.trim());
          if (!foundEmail) {
            throw new Error("Username não encontrado na nuvem. Verifique se digitou corretamente ou use seu e-mail.");
          }
          loginEmail = foundEmail;
          console.log('[Login] E-mail correspondente encontrado:', loginEmail);
        }

        try {
          console.log('[Login] Chamando signInWithPassword...');
          // 1. Autenticação via Supabase Auth (Oficial) com timeout
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
              throw new Error("O servidor de autenticação está demorando muito para responder. Isso pode ser instabilidade na rede. Tente novamente em alguns instantes.");
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
        } catch (supErr: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          console.warn('[Login] Falha no Supabase, analisando possibilidade de login local offline...', supErr);
          
          // Verificação se o erro é de fato um limite de rede ou conexão
          const isNetError = !navigator.onLine || 
            (supErr?.message || '').toLowerCase().includes('failed to fetch') || 
            (supErr?.message || '').toLowerCase().includes('network') ||
            (supErr?.message || '').toLowerCase().includes('connection') ||
            (supErr?.message || '').toLowerCase().includes('load failed') ||
            supErr?.status === 0 ||
            supErr?.message === 'AUTH_TIMEOUT';

          if (isNetError) {
            console.log('[Login] Erro de rede legítimo detectado. Executando login via SQLite local.');
            loggedUser = doLocalAuthFallback();
          } else {
            // Se for erro de credenciais (ou qualquer coisa diferente de timeout/falha de rede), NÃO mascara com o SQLite!
            const errorMsg = (supErr?.message || '').toLowerCase();
            const isInvalidCreds = errorMsg.includes('invalid credentials') || 
                                   errorMsg.includes('invalid_credentials') || 
                                   errorMsg.includes('incorrect') || 
                                   errorMsg.includes('senha');
            
            if (isInvalidCreds) {
              throw new Error("E-mail ou senha incorretos na nuvem");
            } else {
              throw supErr;
            }
          }
        }
      } else {
        // Sem internet ou modo local puro
        loggedUser = doLocalAuthFallback();
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
    return {
      userLabel: "Usuário ou e-mail",
      userPlaceholder: "Digite seu usuário ou e-mail",
      passLabel: "Senha",
      passPlaceholder: "••••••••",
      accentColor: "text-accent",
      focusColor: "focus:border-accent"
    };
  };

  const config = getFieldConfig();

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    
    // Feedback visual
    const titleElement = document.getElementById('login-title');
    if (titleElement) {
      titleElement.style.transform = `scale(${1 + (newCount * 0.05)})`;
      titleElement.style.color = newCount >= 3 ? '#f59e0b' : '';
      setTimeout(() => {
        const el = document.getElementById('login-title');
        if (el) {
          el.style.transform = '';
          if (newCount < 5) el.style.color = '';
        }
      }, 200);
    }

    if (newCount >= 5) {
      onUpdateScreen(AppScreen.STRESS_TEST);
      setClickCount(0);
    } else {
      setClickCount(newCount);
    }
    
    // Reset count after 3 seconds of inactivity
    if (window.clickResetTimeout) clearTimeout(window.clickResetTimeout);
    window.clickResetTimeout = setTimeout(() => {
      setClickCount(0);
      const el = document.getElementById('login-title');
      if (el) el.style.color = '';
    }, 3000);
  };

  return (
    <div className="p-4 min-h-screen h-full flex flex-col justify-start animate-fadeIn bg-bg-main overflow-y-auto no-scrollbar pt-safe pb-safe">
      {/* Header com Logotipo - Ocultado quando teclado está aberto para preservar espaço */}
      {!isKeyboardVisible && (
        <div className="mb-4 text-center relative flex flex-col items-center animate-fadeIn">
          {/* Indicador de Plataforma */}
          <div className="absolute top-0 right-0 bg-accent-soft px-2 py-0.5 rounded-full border border-accent/10">
            <span className="text-[6px] font-black text-accent uppercase tracking-widest">
              {databaseMode === DatabaseMode.INTERNAL ? 'MOBILE' : (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 'MOBILE' : 'DESKTOP')}
            </span>
          </div>

          <div className="w-24 h-24 bg-white border border-border rounded-full flex items-center justify-center mb-3 shadow-xl overflow-hidden p-0.5 ring-4 ring-bg-main">
            <img 
              src={APP_LOGO} 
              alt="GBR Auditoria Logo" 
              className="w-full h-full object-cover rounded-full"
              referrerPolicy="no-referrer"
            />
          </div>
          
          <h1 
            id="login-title"
            onClick={handleTitleClick}
            className="text-lg font-black text-ink tracking-tighter uppercase italic leading-none active:scale-95 transition-all cursor-pointer select-none"
          >
            SISTEMA <span className="text-accent">AUDITORIA</span>
          </h1>
          <p className="text-ink-muted text-[7px] font-bold uppercase tracking-[0.2em] mt-1 opacity-70">
            INVENTÁRIO DE ATIVO IMOBILIZADO
          </p>
        </div>
      )}

      {/* Se o teclado estiver visível, mostramos uma versão compacta do título */}
      {isKeyboardVisible && (
        <div className="mb-4 text-center animate-slideUp">
           <h1 className="text-sm font-black text-ink tracking-tighter uppercase italic">
            SISTEMA <span className="text-accent text-xs">AUDITORIA</span>
          </h1>
        </div>
      )}

      <div className="mb-4 max-w-sm mx-auto w-full">
        {databaseMode === DatabaseMode.INTERNAL && (
          isDatabaseEmpty ? (
            <div className="mt-3 p-3 bg-blue-50/50 border border-blue-100 rounded-2xl">
              <p className="text-[8px] font-black text-blue-700 uppercase tracking-tight leading-tight text-center">
                ⚠️ Banco de dados local vazio. Aguardando carga inicial do administrador.
              </p>
            </div>
          ) : users.length <= 1 ? (
            <div className="mt-3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
              <p className="text-[8px] font-black text-emerald-700 uppercase tracking-tight leading-tight text-center">
                ✅ Banco de dados carregado. Auditores: acessem com suas credenciais locais.
              </p>
            </div>
          ) : null
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5 max-w-sm mx-auto w-full">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-[10px] font-black uppercase flex items-center mb-4 tracking-widest shadow-md animate-shake">
            <AlertCircle size={16} className="mr-3 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}
        
        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-ink-muted uppercase tracking-widest ml-1">{config.userLabel}</label>
          <div className="relative group">
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full pl-11 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white ${config.focusColor} outline-none transition-all text-ink font-bold shadow-sm hover:shadow-md text-sm focus:ring-2 focus:ring-accent/10`}
              placeholder={config.userPlaceholder}
            />
            <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-accent transition-colors" size={20} />
          </div>
        </div>
        
        <div className="space-y-1.5 animate-fadeIn">
          <label className="block text-[10px] font-black text-ink-muted uppercase tracking-widest ml-1">{config.passLabel}</label>
          <div className="relative group">
            <input 
              type={showPassword ? "text" : "password"} 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-4 py-3.5 rounded-2xl border border-slate-200 bg-white ${config.focusColor} outline-none transition-all text-ink font-bold shadow-sm hover:shadow-md text-sm pr-12 focus:ring-2 focus:ring-accent/10`}
              placeholder={config.passPlaceholder}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-slate-300 hover:text-accent transition-colors"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <button 
          type="submit"
          disabled={isLoading}
          className="w-full bg-accent text-white font-black py-4 rounded-2xl shadow-lg shadow-accent/20 active:scale-[0.98] hover:bg-accent-dark transition-all mt-6 uppercase tracking-[0.2em] text-xs flex items-center justify-center space-x-2 disabled:opacity-70"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Autenticando...</span>
            </>
          ) : (
            <span>Acessar Sistema</span>
          )}
        </button>

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

          {/* Botão de Emergência - Movido para local discreto e com lógica seletiva */}
          <button
            type="button"
            onClick={handleClearSession}
            className="text-[8px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest flex items-center justify-center gap-2 transition-colors opacity-80 hover:opacity-100 mt-4 mx-auto"
            title="Use se o login estiver travado ou se mudou de projeto"
          >
            <ShieldAlert className="w-3 h-3" />
            Redefinir Acesso Local
          </button>
        </div>
        
        <div className="pt-4 border-t border-accent/10">
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.4em]">
            AUDITORIA INTELIGENTE
          </p>
          <div className="flex flex-col items-center space-y-3 mt-4">
            <button 
              onClick={onOpenPrivacyCenter}
              className="text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-accent transition-colors flex items-center justify-center space-x-1.5"
            >
              <ShieldCheck size={12} />
              <span>Privacidade e Segurança</span>
            </button>
          </div>
          <p className="text-[7px] font-black text-slate-400 mt-4 uppercase tracking-[0.2em]">
            Versão 2.6 - GBR Native Ready
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
