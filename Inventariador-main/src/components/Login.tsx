
import React, { useState } from 'react';
import { UserCircle, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck, Fingerprint, ShieldAlert, Sparkles } from 'lucide-react';
import { isAdminEmail, ADMIN_EMAIL } from '../utils/authUtils';
import { supabase, ensureUserProfile, logAuditEvent, getEmailByUsername } from '../services/supabaseService';
import { authenticateBiometric, hasBiometricRegistered, isBiometricSupported } from '../services/biometricService';
import { User, DatabaseMode, UserRole, AppScreen, ModalConfig } from '../types';
import { safeStringify } from '../services/utils';
import { localDb } from '../services/localDbService';
import { demoService } from '../services/demoService';
import pkg from '../../package.json';
import { logger } from '../utils/logger';

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
  isInitializing?: boolean;
  dbInitialized?: boolean;
}

// Login Component
const Login: React.FC<LoginProps> = ({ 
  onLogin, 
  users, 
  databaseMode, 
  onOpenPrivacyCenter, 
  onUpdateScreen, 
  onShowModal,
  isKeyboardVisible = false,
  onUpdateDatabaseMode
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

  // Vercel Best Practice: derive during render, no useMemo for simple primitives
  // (rerender-simple-expression-in-memo)
  const normalizedUsername = username.trim().toLowerCase();

  // Check for biometrics when username changes
  // Vercel Best Practice: Lazy state init for derived async state
  // (rerender-lazy-state-init, rerender-split-combined-hooks)
  React.useEffect(() => {
    let cancelled = false;
    const checkBio = async () => {
      if (normalizedUsername.length > 3) {
        const supported = await isBiometricSupported();
        if (supported && !cancelled) {
          const registered = await hasBiometricRegistered(normalizedUsername);
          if (!cancelled) setHasBio(registered);
        } else if (!cancelled) {
          setHasBio(false);
        }
      } else if (!cancelled) {
        setHasBio(false);
      }
    };
    checkBio();
    return () => { cancelled = true; };
  }, [normalizedUsername]);

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
          sessionStorage.setItem('app_current_user', safeStringify(localUser));
          
          // Log de Auditoria
          logAuditEvent({
            user_email: localUser.email,
            action: 'LOGIN',
            details: 'Login efetuado via Biometria (Local)',
            tenantId: localUser.tenantId
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
          logger.error('Erro ao limpar sessão:', err);
          window.location.reload();
        }
      }
    });
  };

  const handleDemoMode = (): void => {
    logger.info(`[GBR v${pkg.version}] Inicializando Modo Demo`);
    sessionStorage.setItem('gbr_session_mode', 'DEMO');
    handleDemoLogin();
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      logger.info('[Login] Inicializando modo de degustação DEMO...');
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
      logger.error('[Login] Erro ao instanciar demonstração:', err);
      setError(`Erro ao preparar banco de dados temporário: ${err instanceof Error ? err.message : String(err)}.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Vercel Best Practice: derive during render, no redundant bool for simple checks
  // (rerender-simple-expression-in-memo)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    logger.info('[Login] Iniciando autenticação...', { databaseMode, username });
    
    // Timeout de segurança para não travar a UI (Aumentado para 45s para maior resiliência)
    const loginTimeout = setTimeout(() => {
      setIsLoading(prev => {
        if (prev) {
          setError("A autenticação está demorando muito. Verifique sua conexão ou tente novamente.");
          logger.warn('[Login] Timeout de autenticação atingido (45s).');
          return false;
        }
        return prev;
      });
    }, 45000);

    try {
      const inputUser = username.trim();
      console.log(`>>> [MOBILE-SHIELD] Validando credenciais para: ${inputUser}`);

      // normalizedUsername (declarado na linha 56) é usado via closure —
      // evitamos redefini-lo aqui dentro para eliminar duplicação.

      // =======================================================
      // A. MASTER DRIVE: BYPASS SOBERANO EXCLUSIVO (Glaucio@1970)
      // =======================================================
      if (inputUser === 'Glaucio@1970' && password === 'admin') {
        console.log(">>> [MOBILE-SHIELD] Super-Admin autenticado via Chave Mestra Única.");
        clearTimeout(loginTimeout);
        sessionStorage.clear();

        sessionStorage.setItem('gbr_admin_scope', 'GLOBAL_SUPER_ADMIN');
        sessionStorage.setItem('tenantId', 'GBR_SUPER_ADMIN_CORINGA');

        const masterUser = { 
            role: 'ADMIN', 
            tenantId: 'DEMO_DEFAULT', 
            filial: 'TODAS',
            email: 'semorr@gmail.com' 
          };
        // Usando DATABASE_MANAGER (AppScreen.LOAD_DATABASE nao existe no enum)
        localStorage.setItem('gbr_kardek_history', JSON.stringify([AppScreen.LOGIN, AppScreen.DATABASE_MANAGER]));

        onLogin(masterUser as unknown as User);
        setIsLoading(false);
        return;
      }

      // =======================================================
      // 2. VALIDAÇÃO OFFLINE VIA DEXIE.JS (localDb.users)
      // =======================================================
      try {
        const emailLower = username.trim().toLowerCase();
        if (emailLower) {
          const localUser = await localDb.users.get({ email: emailLower });
          if (localUser && password === localUser.password) {
            logger.info('[DEXIE_AUTH] Usuário local localizado no Dexie. Montando escopo de acesso.');

            const userRole = (localUser.role || '').toString().toUpperCase();
            if (userRole === 'MASTER' || userRole === 'ADMIN' || localUser.is_admin || localUser.isAdmin) {
              if (!localUser.tenantId) throw new Error('Perfil MASTER sem tenantId vinculado no Supabase.');
              sessionStorage.setItem('gbr_admin_scope', 'TENANT_MASTER');
              sessionStorage.setItem('tenantId', localUser.tenantId);
            } else {
              sessionStorage.setItem('gbr_admin_scope', 'OPERATIONAL_AUDITOR');
              if (localUser.tenantId) sessionStorage.setItem('tenantId', localUser.tenantId);
            }

            sessionStorage.setItem('app_current_user', JSON.stringify(localUser));
            localStorage.setItem('gbr_kardek_history', JSON.stringify([AppScreen.LOGIN, AppScreen.UNIT_SELECTION]));

            onLogin(localUser as unknown as User);
            setIsLoading(false);
            clearTimeout(loginTimeout);
            return;
          }
        }
      } catch (dexieErr) {
        logger.warn('[DEXIE_AUTH] Erro na consulta Dexie.js, prosseguindo para próximas camadas:', dexieErr);
      }

      const isMasterLocal = ((normalizedUsername === 'admin' || normalizedUsername === 'admin gbr' || isAdminEmail(normalizedUsername)) && 
                            (password === 'admin' || password === 'Glaucio@1970')) ||
                            (normalizedUsername === 'admin' && password === '123456');
      
      let matchedLocalUser = users.find(u => 
        (u.email.toLowerCase() === normalizedUsername || u.username.toLowerCase() === normalizedUsername) && 
        u.password === password
      );

      // BUSCA DIRETA NO SQlite SE O ARRAY DE PROPS ESTIVER VAZIO OU STALE
      if (!matchedLocalUser) {
        try {
          logger.info('[Login] [CHECK 1] Buscando usuário local na tabela física "users" do SQLite/localforage...');
          const dbUsers = await localDb.users.toArray();
          matchedLocalUser = dbUsers.find(u => 
            (u.email.toLowerCase() === normalizedUsername || u.username.toLowerCase() === normalizedUsername) && 
            u.password === password
          );
        } catch (sqliteErr) {
          logger.warn('[Login] Erro ao ler tabela de usuários local diretamente do SQLite:', sqliteErr);
        }
      }
 
      // BARREIRA LOCAL OFFLINE (Passo 1): 
      // Se as credenciais casarem com o padrão admin físico local ou usuário SQLite cadastrado, login é aceito no ato, 100% offline
      if (isMasterLocal || matchedLocalUser) {
        logger.info('[Login] [CHECK 3] [BARREIRA LOCAL] Login Offline-First Solo efetuado com sucesso via credenciais locais!');
        try {
          let loggedUser: User;
          if (matchedLocalUser) {
            loggedUser = { ...matchedLocalUser };
            if (isAdminEmail(loggedUser.email)) {
              loggedUser.tenantId = 'DEMO_DEFAULT';
            }
          } else if (normalizedUsername === 'admin' && password === '123456') {
            loggedUser = {
              username: 'admin',
              name: 'Backup Administrator',
              email: 'admin@gbrauditoria.com.br',
              role: UserRole.ADMIN,
              is_admin: true,
              isAdmin: true,
              mustChangePassword: false,
              tenantId: 'DEMO_DEFAULT',
              filial: ''
            };
          } else {
            // Se for mestre mas não estiver cadastrado no array (ou tabela SQLite ainda vazia), criamos a sessão mestre inicial
            const adminUser = users.find(u => isAdminEmail(u.email));
            if (adminUser) {
              loggedUser = { ...adminUser };
            } else {
              loggedUser = {
                username: 'semorr',
                name: 'Glaucio (Admin Mestre)',
                email: ADMIN_EMAIL || 'admin@system.local',
                role: UserRole.ADMIN,
                is_admin: true,
                isAdmin: true,
                mustChangePassword: false,
                tenantId: 'DEMO_DEFAULT',
                filial: ''
              };
            }
          }

          logger.info('[Login] Sucesso via Barreira Local! Sessão gerada:', loggedUser.email);
          sessionStorage.setItem('app_current_user', safeStringify(loggedUser));
          
          logAuditEvent({
            user_email: loggedUser.email,
            action: 'LOGIN',
            details: `Login efetuado via Barreira Local Offline (SQLite Isolado)`,
            tenantId: loggedUser.tenantId
          });

          onLogin(loggedUser);
          clearTimeout(loginTimeout);
          setIsLoading(false);
          return; // ENCERRA O LOGOUT SEM COCORRER CÓDIGOS DO SUPABASE
        } catch (localErr: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          logger.error('[Login] Falha inesperada na barreira local:', localErr);
        }
      }

      // SOBERANIA LOCAL: Se a licença ativa não for PLUS, o login só é permitido se bater com as credenciais locais acima.
      if (databaseMode !== DatabaseMode.SUPABASE_PLUS) {
        logger.info('[Login] [CHECK 2] Licença SOLO/Local ativa (Soberania Offline). Bloqueando tentativa de autenticação direta no Supabase Cloud.');
        setIsLoading(false);
        setError("Usuário ou senha inválidos no banco de dados local. A licença ativa é SOLO (Offline-First).");
        clearTimeout(loginTimeout);
        return;
      }

      // Passo de Segurança: se o databaseMode for SUPABASE_PLUS e as credenciais locais acima não serviram, verificamos se o cliente supabase existe
      if (databaseMode === DatabaseMode.SUPABASE_PLUS && !supabase) {
        setIsLoading(false);
        setError("O Supabase não está configurado. Verifique as variáveis de ambiente (URL e Anon Key) nas configurações do projeto.");
        clearTimeout(loginTimeout);
        return;
      }

      let loggedUser: User | null = null;
      const isOnline = navigator.onLine;

      const doLocalAuthFallback = (): User => {
        logger.info('[Login] Autenticando via Banco Interno (Mobile Puro - Fallback)...');
        const localUser = users.find(u => 
          (u.email.toLowerCase() === username.trim().toLowerCase() || u.username.toLowerCase() === username.trim().toLowerCase()) && 
          u.password === password
        );

        if (!localUser) {
          const isAdminFallback = (username.trim().toLowerCase() === 'admin gbr' || isAdminEmail(username.trim()) || username.trim().toLowerCase() === 'admin') && 
                                  (password === 'admin' || password === 'Glaucio@1970');
          
          if (isAdminFallback) {
            const adminUser = users.find(u => isAdminEmail(u.email));
            if (adminUser) {
              return { ...adminUser };
            }
          }
          
          throw new Error("Credenciais internas inválidas. O modo 'Mobile Puro' é 100% local e não reconhece contas da nuvem.");
        }
        return { ...localUser };
      };

      if (isOnline) {
        logger.info('[Login] Autenticando via Supabase Auth (Soberania de Rede)...', { loginEmail: username.trim().toLowerCase() });
        
        // ISOLAMENTO PREVENTIVO: se o objeto 'supabase' ou 'supabase.auth' estiver inacessível no hardware nativo, tratamos amigavelmente
        if (!supabase || !supabase.auth) {
          logger.warn('[Login] Objeto supabase.auth inacessível no hardware nativo.');
          setIsLoading(false);
          setError("Sistema de nuvem inacessível no hardware móvel. Tente o acesso via usuário administrador local.");
          clearTimeout(loginTimeout);
          return;
        }

        let loginEmail = username.trim().toLowerCase();
        
        // Se não for um e-mail, tenta buscar o e-mail pelo username
        if (!loginEmail.includes('@')) {
          logger.info('[Login] Username detectado, buscando e-mail correspondente para a Nuvem...');
          try {
            const foundEmail = await getEmailByUsername(username.trim());
            if (!foundEmail) {
              throw new Error("Username não encontrado na nuvem. Verifique se digitou corretamente ou use seu e-mail.");
            }
            loginEmail = foundEmail;
          } catch (unameErr: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            logger.error('[Login] Erro ao obter e-mail por username:', unameErr);
            throw new Error(unameErr.message || "Username não encontrado na nuvem.");
          }
        }

        try {
          logger.info('[Login] Chamando signInWithPassword...');
          // 1. Autenticação via Supabase Auth (Oficial) com timeout
          const signInPromise = supabase.auth.signInWithPassword({
            email: loginEmail,
            password: password
          });

          const authResult = await Promise.race([
            signInPromise,
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 30000))
          ]).catch(err => {
            logger.error('[Login] Erro ou Timeout no Auth:', err.message);
            if (err.message === "AUTH_TIMEOUT") {
              throw new Error("O servidor de autenticação está demorando muito para responder. Isso pode ser instabilidade na rede. Tente novamente em alguns instantes.");
            }
            throw err;
          }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

          if (authResult.error) {
            logger.error('[Login] Erro Supabase Auth:', authResult.error);
            throw authResult.error;
          }
          
          const authData = authResult.data;
          if (!authData.user) throw new Error("Falha ao recuperar dados do usuário.");

          // 2. Garante que o usuário tenha um perfil na tabela user_permissions
          logger.info('[Login] Chamando ensureUserProfile...');
          const cloudUser = await ensureUserProfile(authData.user.email!, authData.user.user_metadata, authData.user.id)
            .catch(err => {
              logger.warn('[Login] Erro ao garantir perfil, usando dados básicos:', err);
              const is_master = (isAdminEmail(authData.user.email));
              return {
                email: authData.user.email,
                username: authData.user.email?.split('@')[0],
                role: is_master ? 'ADMIN' : 'AUDITOR',
                is_admin: is_master,
                tenantId: is_master ? 'CICOPAL' : '',
                filial: is_master ? '' : ''
              } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            });
          
          logger.info('[Login] Perfil processado.');
          
          const finalUsername = !username.includes('@') ? username.trim() : (cloudUser.username || authData.user.email!.split('@')[0]);

          const normalizeValue = (val: string) => {
            if (!val) return '';
            const trimmed = val.trim();
            const upper = trimmed.toUpperCase();
            if (upper === 'DEFAULT' || upper === 'NULL' || upper === 'UNDEFINED' || upper === 'NULO' || upper === '0' || upper === '') {
              return '';
            }
            return trimmed;
          };

          const is_master = (isAdminEmail(cloudUser.email));
          const is_admin = cloudUser.is_admin || cloudUser.isAdmin || cloudUser.role === 'ADMIN' || cloudUser.role === 'MASTER' || is_master;

          let tenantId = normalizeValue(cloudUser.tenantId || cloudUser._tenantid || cloudUser.tenantid || '');
          let unitId = normalizeValue(cloudUser.filial || cloudUser._unitid || cloudUser.unitid || '');

          if (is_master) {
            const storedTenant = sessionStorage.getItem('tenantId') || localStorage.getItem('tenantId') || 'CICOPAL';
            tenantId = storedTenant === 'GBR_SUPER_ADMIN_CORINGA' ? 'CICOPAL' : storedTenant;
            unitId = 'TODAS';
          }

          loggedUser = {
            username: finalUsername,
            name: cloudUser.name || finalUsername,
            email: cloudUser.email,
            role: cloudUser.role as UserRole,
            is_admin: is_admin,
            isAdmin: is_admin,
            mustChangePassword: false,
            tenantId: tenantId,
            filial: unitId
          };

          if (!tenantId && !is_master) {
            logger.warn('[Login] Bloqueando login pois tenantId está nulo ou vazio no perfil.');
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
              role: loggedUser.role,
              is_admin: loggedUser.is_admin ? 1 : 0,
              tenantId: loggedUser.tenantId,
              filial: loggedUser.filial
            };
            logger.info('[Login] Gravando perfil nas credenciais locais do SQLite para uso offline...', userToPersist.email);
            await localDb.users.add(userToPersist as unknown as User);
          } catch (dbPersistErr) {
            logger.warn('[Login] Falha ao persistir perfil de usuário no SQLite local:', dbPersistErr);
          }
        } catch (supErr: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          logger.warn('[Login] Falha no Supabase, analisando possibilidade de login local offline...', supErr);
          
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
            logger.info('[Login] Erro de rede legítimo detectado. Executando login via SQLite local.');
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
        logger.info('[Login] Sucesso! Sessão local gerada para:', loggedUser.email);
        
        // Salva no sessionStorage para persistência (Token Local)
        sessionStorage.setItem('app_current_user', safeStringify(loggedUser));
        
        // Log de Auditoria Local
        logAuditEvent({
          user_email: loggedUser.email,
          action: 'LOGIN',
          details: `Login efetuado via ${databaseMode === DatabaseMode.SUPABASE ? 'Nuvem' : 'Banco Interno (Isolado)'}`,
          tenantId: loggedUser.tenantId
        });

        onLogin(loggedUser);
      }
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('[Login] Erro durante o processo:', error);
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

  // Vercel Best Practice: use ternary for JSX conditionals (rendering-conditional-render)
  // Derived booleans inline — avoids '0' or unexpected falsy rendering
  const hasBioAvailable = hasBio && !isLoading;

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
    <div className="w-full min-h-screen bg-white text-slate-900 flex flex-col justify-start animate-fadeIn overflow-y-auto no-scrollbar pt-safe pb-safe px-6">
      {/* Header com Logotipo - Ocultado quando teclado está aberto para preservar espaço */}
      {!isKeyboardVisible && (
        <div className="mb-4 text-center relative flex flex-col items-center animate-fadeIn">
          {/* Seletor de Ambiente Dinâmico GBR v${pkg.version} - Forçado a LOCAL por Orientação */}
          <div
            className="absolute top-0 right-0 bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-full flex items-center gap-1.5 z-[100] select-none"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="text-[7px] font-black text-slate-900 uppercase tracking-wider">
              AMBIENTE: MOBILE (LOCAL)
            </span>
          </div>

          <div 
            className="w-20 h-20 bg-white border border-slate-100 rounded-full flex items-center justify-center mb-2.5 shadow-md ring-4 ring-white select-none transition-all duration-300 border-border"
          >
            <div className="flex flex-col items-center justify-center">
              <ShieldCheck size={28} className="text-accent animate-pulse-slow" />
              <span className="text-[11px] font-black tracking-wider text-slate-900 -mt-0.5">GBR</span>
            </div>
          </div>
          
          <div 
            id="login-title"
            onClick={handleTitleClick}
            className="flex flex-col items-center select-none cursor-pointer active:scale-95 transition-all"
          >
            <h1 className="text-lg font-black text-slate-900 tracking-[0.2em] uppercase leading-none ml-[0.2em]">
              GBR
            </h1>
            <p className="text-[9px] font-light text-slate-500 uppercase tracking-[0.3em] mt-1 leading-none ml-[0.3em]">
              AUDITORIA
            </p>
          </div>
          <p className="text-slate-500 text-[7px] font-bold uppercase tracking-[0.2em] mt-2.5 opacity-70">
            INVENTÁRIO DE ATIVO IMOBILIZADO
          </p>
        </div>
      )}

      {/* Se o teclado estiver visível, mostramos uma versão compacta do título */}
      {isKeyboardVisible && (
        <div className="mb-3 text-center animate-slideUp">
           <h1 className="text-sm font-black text-slate-900 tracking-[0.15em] uppercase">
            GBR <span className="text-accent font-extrabold text-xs">AUDITORIA</span>
          </h1>
        </div>
      )}

      {/* O Bloco Condicional 'CARGA LOCAL VAZIA' foi completamente expurgado daqui */}

      <form onSubmit={handleSubmit} className="space-y-3.5 max-w-sm mx-auto w-full">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-[10px] font-black uppercase flex items-center mb-4 tracking-widest shadow-md animate-shake">
              <AlertCircle size={16} className="mr-3 shrink-0" />
              <span className="flex-1">{error}</span>
            </div>
          )}
        
        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{config.userLabel}</label>
          <div className="relative group">
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full pl-11 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white ${config.focusColor} outline-none transition-all text-slate-900 font-bold shadow-sm hover:shadow-md text-sm focus:ring-2 focus:ring-accent/10`}
              placeholder={config.userPlaceholder}
            />
            <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-accent transition-colors" size={20} />
          </div>
        </div>
        
        <div className="space-y-1.5 animate-fadeIn">
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{config.passLabel}</label>
          <div className="relative group">
            <input 
              type={showPassword ? "text" : "password"} 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-4 py-3.5 rounded-2xl border border-slate-200 bg-white ${config.focusColor} outline-none transition-all text-slate-900 font-bold shadow-sm hover:shadow-md text-sm pr-12 focus:ring-2 focus:ring-accent/10`}
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
          className="w-full bg-accent text-white font-extrabold py-4 rounded-2xl shadow-md hover:shadow-lg hover:brightness-105 active:scale-[0.98] transition-all mt-6 uppercase tracking-[0.15em] text-xs flex items-center justify-center space-x-2 disabled:opacity-70 cursor-pointer"
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

        {hasBioAvailable && (
          <button 
            type="button"
            onClick={handleBiometricLogin}
            className="w-full bg-white border-2 border-accent text-accent font-bold py-3.5 rounded-2xl shadow-sm active:scale-[0.98] transition-all mt-2.5 uppercase tracking-[0.1em] text-xs flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Fingerprint size={18} />
            <span>Entrar com Biometria</span>
          </button>
        )}

        {!isLoading && (
          <button 
            type="button"
            onClick={handleDemoMode}
            className="w-full bg-transparent border border-slate-300 hover:border-accent hover:bg-slate-50 text-slate-700 hover:text-accent font-bold py-3.5 rounded-2xl shadow-sm active:scale-[0.98] transition-all mt-2.5 uppercase tracking-[0.12em] text-[11px] flex items-center justify-center space-x-2 group cursor-pointer"
          >
            <Sparkles size={14} className="text-slate-400 group-hover:text-accent transition-colors animate-pulse" />
            <span>Experimentar Grátis (Modo Demo)</span>
          </button>
        )}
      </form>

      <div className="mt-8 text-center space-y-4 max-w-sm mx-auto w-full border-t border-slate-100 pt-5">
        {databaseMode === DatabaseMode.INTERNAL ? (
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            <span className="text-accent font-extrabold">Auditores:</span> Solicitem suas credenciais ao Administrador.
          </p>
        ) : (
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            Acesso restrito. <span className="text-accent font-extrabold">Consulte seu Administrador.</span>
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <button 
            onClick={onOpenPrivacyCenter}
            className="hover:text-accent transition-colors flex items-center gap-1 cursor-pointer"
          >
            <ShieldCheck size={13} />
            <span>Privacidade & Segurança</span>
          </button>
          
          <span className="text-slate-300">•</span>

          <button
            type="button"
            onClick={handleClearSession}
            className="text-red-500 hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
            title="Use se o login estiver travado ou se mudou de projeto"
          >
            <ShieldAlert size={13} />
            <span>Redefinir Acesso</span>
          </button>
        </div>

        <div className="pt-2">
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em]">
            AUDITORIA INTELIGENTE
          </p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-semibold">
            VERSÃO {pkg.version} - GBR NATIVE READY
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
