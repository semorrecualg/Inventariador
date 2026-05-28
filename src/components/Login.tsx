
import React, { useState } from 'react';
import { UserCircle, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck, Fingerprint, ShieldAlert, Sparkles, Database } from 'lucide-react';
import { supabase, ensureUserProfile, logAuditEvent, getEmailByUsername } from '../services/supabaseService';
import { authenticateBiometric, hasBiometricRegistered, isBiometricSupported } from '../services/biometricService';
import { User, DatabaseMode, UserRole, AppScreen, ModalConfig } from '../types';
import { APP_LOGO } from '../constants';
import { safeStringify } from '../services/utils';
import { localDb } from '../services/localDbService';
import { demoService } from '../services/demoService';

interface LoginProps {
  onLogin: (user: User) => void;
  users: User[];
  databaseMode: DatabaseMode;
  onOpenPrivacyCenter: () => void;
  onUpdateScreen: (screen: AppScreen) => void;
  onShowModal: (config: Partial<ModalConfig>) => void;
  isDatabaseEmpty?: boolean;
  isKeyboardVisible?: boolean;
  onUpdateDatabaseMode?: (mode: DatabaseMode) => void;
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
  isKeyboardVisible = false,
  onUpdateDatabaseMode
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clickCount, setClickCount] = useState(0);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isPressingLogo, setIsPressingLogo] = useState(false);

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
    // Busca telemetria de erro persistida localmente se houver
    const lastDbErrorStr = localStorage.getItem('gbr_kardex_last_db_error');
    let dbErrorMessage = '';
    if (lastDbErrorStr) {
      try {
        const parsed = JSON.parse(lastDbErrorStr);
        dbErrorMessage = `\n\n[TELEMETRIA DE ERRO DO BANCO]:\nErro: ${parsed.message || lastDbErrorStr}\nData/Hora: ${parsed.timestamp || ''}\n\n`;
      } catch {
        dbErrorMessage = `\n\n[TELEMETRIA DE ERRO DO BANCO]:\n${lastDbErrorStr}\n\n`;
      }
    }

    onShowModal({
      title: 'Redefinir Acesso Local',
      message: `Esta ação deslogará o usuário e redefinirá as configurações de acesso. Seus dados de auditoria salvos no SQLite permanecerão intactos.${dbErrorMessage}Deseja continuar?`,
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

  const handleCargaExpertInstantBypass = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('>>> [Carga Expert] Iniciando limpeza bruta e injeção forçada de contingência...');
      
      // 1. Purga física do arquivo e execução de VACUUM
      await localDb.purgeDatabase();
      
      // 2. Injeção atômica dos 50+ ativos em lote com tenantId: "DEMO_DEFAULT"
      await localDb.forceInjectDemoSeed();
      
      // Altera modo para usar SQLite localmente como fonte da verdade
      onUpdateDatabaseMode?.(DatabaseMode.INTERNAL);
      const demoUser = demoService.getDemoUser();
      
      onShowModal({
        title: '⚡ CARGA EXPERT ATIVA',
        message: 'Banco físico limpo com sucesso e contingência implantada com 50+ ativos. Redirecionando agora...',
        type: 'success',
        onConfirm: () => {
          onLogin(demoUser);
        }
      });
    } catch (err) {
      console.error('[Carga Expert] Falha crítica:', err);
      
      // Tentativa de cura em Memória se houver falha persistente
      try {
        console.warn('[Carga Expert Fallback] Aplicando motor em Memória após falha do banco físico...');
        const success = await demoService.initDemoSession();
        if (success) {
          onUpdateDatabaseMode?.(DatabaseMode.INTERNAL);
          const demoUser = demoService.getDemoUser();
          onLogin(demoUser);
          return;
        }
      } catch (innerErr) {
        console.error('[Carga Expert Drop] Fallback em memória também falhou:', innerErr);
      }
      
      setError(`Falha crítica na injeção da Carga Expert: ${err instanceof Error ? err.message : String(err)}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const startPressLogo = () => {
    setIsPressingLogo(true);
    const timer = setTimeout(() => {
       handleCargaExpertInstantBypass();
    }, 3000); // 3 segundos
    setLongPressTimer(timer);
  };

  const endPressLogo = () => {
    setIsPressingLogo(false);
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('[Login] Inicializando modo de degustação DEMO...');
      const success = await demoService.initDemoSession();
      if (success) {
        // Altera modo para usar SQLite localmente como fonte da verdade
        onUpdateDatabaseMode?.(DatabaseMode.INTERNAL);
        const demoUser = demoService.getDemoUser();
        onLogin(demoUser);
      } else {
        const lastErrStr = localStorage.getItem('gbr_kardex_last_db_error');
        let errorHint = '';
        if (lastErrStr) {
          try {
            const parsed = JSON.parse(lastErrStr);
            errorHint = `: ${parsed.message}`;
          } catch {
            errorHint = `: ${lastErrStr}`;
          }
        }
        setError(`Erro ao iniciar base demonstrativa de dados locais${errorHint}.`);
      }
    } catch (err) {
      console.error('[Login] Erro ao instanciar demonstração:', err);
      setError(`Erro ao preparar banco de dados temporário: ${err instanceof Error ? err.message : String(err)}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    console.log('[Login] Iniciando autenticação...', { databaseMode, username });
    
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
      const normalizedUsername = username.trim().toLowerCase();
      
      const isMasterLocal = (normalizedUsername === 'admin' || normalizedUsername === 'admin gbr' || normalizedUsername === 'semorr@gmail.com') && 
                            (password === 'admin' || password === 'Glaucio@1970');
      
      const matchedLocalUser = users.find(u => 
        (u.email.toLowerCase() === normalizedUsername || u.username.toLowerCase() === normalizedUsername) && 
        u.password === password
      );

      // BARREIRA LOCAL OFFLINE (Passo 1): 
      // Se as credenciais casarem com o padrão admin físico local ou usuário SQLite cadastrado, login é aceito no ato, 100% offline
      if (isMasterLocal || matchedLocalUser) {
        console.log('[Login] [BARREIRA LOCAL] Credenciais correspondem a operador administrador mestre ou cadastrado localmente. Desviando fluxo do Supabase imediatamente.');
        try {
          let loggedUser: User;
          if (matchedLocalUser) {
            loggedUser = { ...matchedLocalUser };
          } else {
            // Se for mestre mas não estiver cadastrado no array (ou tabela SQLite ainda vazia), criamos a sessão mestre inicial
            const adminUser = users.find(u => u.email.toLowerCase() === 'semorr@gmail.com');
            if (adminUser) {
              loggedUser = { ...adminUser };
            } else {
              loggedUser = {
                username: 'semorr',
                name: 'Glaucio (Admin Mestre)',
                email: 'semorr@gmail.com',
                role: UserRole.ADMIN,
                is_admin: true,
                isAdmin: true,
                mustChangePassword: false,
                _tenantid: 'CICOPAL',
                _unitid: 'MATRIZ',
                tenantid: 'CICOPAL',
                unitid: 'MATRIZ',
                units: ['MATRIZ'],
                tenants: ['CICOPAL']
              };
            }
          }

          console.log('[Login] Sucesso via Barreira Local! Sessão gerada:', loggedUser.email);
          localStorage.setItem('app_current_user', safeStringify(loggedUser));
          
          logAuditEvent({
            user_email: loggedUser.email,
            action: 'LOGIN',
            details: `Login efetuado via Barreira Local Offline (SQLite Isolado)`,
            _tenantid: loggedUser._tenantid || loggedUser.tenantid
          });

          onLogin(loggedUser);
          clearTimeout(loginTimeout);
          setIsLoading(false);
          return; // ENCERRA O LOGOUT SEM COCORRER CÓDIGOS DO SUPABASE
        } catch (localErr: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          console.error('[Login] Falha inesperada na barreira local:', localErr);
        }
      }

      // Passo de Segurança: se o databaseMode for SUPABASE e as credenciais locais acima não serviram, verificamos se o cliente supabase existe
      if (databaseMode === DatabaseMode.SUPABASE && !supabase) {
        setIsLoading(false);
        setError("O Supabase não está configurado. Verifique as variáveis de ambiente (URL e Anon Key) nas configurações do projeto.");
        clearTimeout(loginTimeout);
        return;
      }

      let loggedUser: User | null = null;
      const isOnline = navigator.onLine;

      const doLocalAuthFallback = (): User => {
        console.log('[Login] Autenticando via Banco Interno (Mobile Puro - Fallback)...');
        const localUser = users.find(u => 
          (u.email.toLowerCase() === username.trim().toLowerCase() || u.username.toLowerCase() === username.trim().toLowerCase()) && 
          u.password === password
        );

        if (!localUser) {
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

      if (isOnline) {
        console.log('[Login] Autenticando via Supabase Auth (Soberania de Rede)...', { loginEmail: username.trim().toLowerCase() });
        
        // ISOLAMENTO PREVENTIVO: se o objeto 'supabase' ou 'supabase.auth' estiver inacessível no hardware nativo, tratamos amigavelmente
        if (!supabase || !supabase.auth) {
          console.warn('[Login] Objeto supabase.auth inacessível no hardware nativo.');
          setIsLoading(false);
          setError("Sistema de nuvem inacessível no hardware móvel. Tente o acesso via usuário administrador local.");
          clearTimeout(loginTimeout);
          return;
        }

        let loginEmail = username.trim().toLowerCase();
        
        // Se não for um e-mail, tenta buscar o e-mail pelo username
        if (!loginEmail.includes('@')) {
          console.log('[Login] Username detectado, buscando e-mail correspondente para a Nuvem...');
          try {
            const foundEmail = await getEmailByUsername(username.trim());
            if (!foundEmail) {
              throw new Error("Username não encontrado na nuvem. Verifique se digitou corretamente ou use seu e-mail.");
            }
            loginEmail = foundEmail;
          } catch (unameErr: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            console.error('[Login] Erro ao obter e-mail por username:', unameErr);
            throw new Error(unameErr.message || "Username não encontrado na nuvem.");
          }
        }

        try {
          console.log('[Login] Chamando signInWithPassword...');
          // 1. Autenticação via Supabase Auth (Oficial) com timeout
          const signInPromise = supabase.auth.signInWithPassword({
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

          if (!tenantId && !is_master) {
            console.warn('[Login] Bloqueando login pois tenantId está nulo ou vazio no perfil.');
            if (supabase) {
              await supabase.auth.signOut();
            }
            throw new Error("Erro de Configuração: Perfil de usuário sem vínculo de empresa ativo. Contate o administrador.");
          }

          // Persistência local no SQLite para habilitar login offline subsequente (Soberania Nativa)
          try {
            const userToPersist = {
              id: loggedUser.id || loggedUser.email,
              username: loggedUser.username,
              name: loggedUser.name,
              email: loggedUser.email,
              password: password, // plaintext password Typed by user for offline matching
              role: loggedUser.role,
              is_admin: loggedUser.is_admin ? 1 : 0,
              _tenantid: loggedUser._tenantid,
              _unitid: loggedUser._unitid
            };
            console.log('[Login] Gravando perfil nas credenciais locais do SQLite para uso offline...', userToPersist.email);
            await localDb.users.add(userToPersist as unknown as User);
          } catch (dbPersistErr) {
            console.warn('[Login] Falha ao persistir perfil de usuário no SQLite local:', dbPersistErr);
          }
        } catch (supErr: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          console.warn('[Login] Falha no Supabase, analisando possibilidade de login local offline...', supErr);
          
          const rawMessage = typeof supErr === 'string' 
            ? supErr 
            : (supErr?.message || supErr?.error_description || String(supErr || ''));
          const errorMsg = rawMessage.toLowerCase();
          
          // Verificação se o erro é de fato um limite de rede ou conexão
          const isNetError = !navigator.onLine || 
            errorMsg.includes('failed to fetch') || 
            errorMsg.includes('network') ||
            errorMsg.includes('connection') ||
            errorMsg.includes('load failed') ||
            supErr?.status === 0 ||
            errorMsg.includes('auth_timeout') ||
            supErr?.message === 'AUTH_TIMEOUT';

          if (isNetError) {
            console.log('[Login] Erro de rede legítimo detectado. Executando login via SQLite local.');
            loggedUser = doLocalAuthFallback();
          } else {
            // Se for erro de credenciais (ou qualquer coisa diferente de timeout/falha de rede), NÃO mascara com o SQLite!
            const isInvalidCreds = errorMsg.includes('invalid credentials') || 
                                   errorMsg.includes('invalid_credentials') || 
                                   errorMsg.includes('incorrect') || 
                                   errorMsg.includes('senha') ||
                                   errorMsg.includes('invalid grant') ||
                                   errorMsg.includes('user not found') ||
                                   errorMsg.includes('user_not_found') ||
                                   errorMsg.includes('invalid email') ||
                                   errorMsg.includes('invalid password');
            
            if (isInvalidCreds) {
              throw new Error("E-mail ou senha incorretos na nuvem");
            } else {
              throw new Error(rawMessage || "Erro ao autenticar. Verifique seus dados.");
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
          {/* Seletor de Ambiente Dinâmico GBR v2.6 */}
          <button
            type="button"
            onClick={() => {
              if (onUpdateDatabaseMode) {
                const nextMode = databaseMode === DatabaseMode.INTERNAL ? DatabaseMode.SUPABASE : DatabaseMode.INTERNAL;
                onUpdateDatabaseMode(nextMode);
              }
            }}
            className="absolute top-0 right-0 bg-accent/10 border border-accent/20 hover:bg-accent/20 active:scale-95 transition-all px-2.5 py-1 rounded-full flex items-center gap-1.5 cursor-pointer z-[100]"
            title="Clique para alternar o ambiente de dados"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${databaseMode === DatabaseMode.INTERNAL ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`}></span>
            <span className="text-[7px] font-black text-ink uppercase tracking-wider">
              {databaseMode === DatabaseMode.INTERNAL ? 'AMBIENTE: MOBILE (LOCAL)' : 'AMBIENTE: NUVEM (ONLINE)'}
            </span>
          </button>

          <div 
            onTouchStart={startPressLogo}
            onTouchEnd={endPressLogo}
            onMouseDown={startPressLogo}
            onMouseUp={endPressLogo}
            onMouseLeave={endPressLogo}
            className={`w-24 h-24 bg-white border rounded-full flex items-center justify-center mb-3 shadow-xl overflow-hidden p-0.5 ring-4 ring-bg-main cursor-pointer select-none transition-all duration-300 ${isPressingLogo ? 'scale-90 border-amber-500 ring-amber-500/55 shadow-amber-200/20' : 'border-border'}`}
            title="Mantenha pressionado por 3 segundos para contra-medida Carga Expert"
          >
            <img 
              src={APP_LOGO} 
              alt="GBR Auditoria Logo" 
              className="w-full h-full object-cover rounded-full pointer-events-none"
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
          (isDatabaseEmpty || users.length === 0) ? (
            <div className="mt-3 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2 text-left">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider leading-tight">
                  Carga local vazia
                </p>
                <p className="text-[8.5px] font-bold text-amber-700 leading-normal uppercase mt-0.5">
                  Realize o primeiro login online para sincronizar.
                </p>
              </div>
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

        {!isLoading && (
          <button 
            type="button"
            onClick={handleDemoLogin}
            className="w-full bg-slate-900 hover:bg-slate-850 text-emerald-400 font-extrabold py-3.5 rounded-2xl shadow-sm active:scale-[0.98] border border-emerald-500/20 transition-all mt-2 uppercase tracking-[0.15em] text-xs flex items-center justify-center space-x-2"
          >
            <Sparkles size={16} className="text-emerald-400 animate-pulse" />
            <span>Experimentar Grátis (Modo Demo)</span>
          </button>
        )}

        {!isLoading && (
          <button 
            type="button"
            onClick={handleCargaExpertInstantBypass}
            className="w-full bg-amber-950/20 hover:bg-amber-900/30 text-amber-500 font-black py-4 rounded-2xl border border-amber-500/30 active:scale-[0.98] transition-all mt-2 uppercase tracking-[0.15em] text-xs flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/5 hover:border-amber-400"
          >
            <Database size={16} className="text-amber-500 animate-pulse" />
            <span>⚡ CARGA EXPERT (FORÇAR CONTINGÊNCIA)</span>
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
