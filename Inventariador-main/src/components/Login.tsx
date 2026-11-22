
import React, { useState } from 'react';
import { UserCircle, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck, Fingerprint, ShieldAlert, Sparkles } from 'lucide-react';
import { isAdminEmail, markAppManagedSession, ADMIN_EMAIL } from '../utils/authUtils';
import { stripUserSecrets, verifyUserPassword } from '../utils/passwordHash';
import { useLocalAuth } from '../hooks/useLocalAuth';
import { supabase, ensureUserProfile, logAuditEvent, getEmailByUsername, isInternalMode } from '../services/supabaseService';
import { authenticateBiometric, checkNativeBiometry, hasBiometricRegistered, isBiometricSupported, isNativeAppShell } from '../services/biometricService';
import { canOfferBiometricUnlock, forgetLastLoginUser, normalizeUnlockUser, readLastLoginUser, rememberLastLoginUser } from '../utils/biometricUnlock';
import BiometricUnlock from './BiometricUnlock';
import { User, DatabaseMode, UserRole, AppScreen, ModalConfig } from '../types';
import { safeStringify } from '../services/utils';
import { localDb } from '../services/localDbService';
import { demoService } from '../services/demoService';
import { APP_VERSION, APP_VERSION_LABEL } from '../utils/appVersion';
import { logger } from '../utils/logger';
import { readSessionTenantId, readLocalTenantId } from '../utils/tenantUtils';
import { resetLocalAccessStorage } from '../utils/localAccessReset';
import { clearPersistedSession } from '../utils/sessionPersistence';

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

  // FLUXO ÚNICO DE ACESSO: a tela de login apenas AUTENTICA. Contrato, filial
  // (unidade operacional) e módulo são escolhidos na tela de contrato de
  // trabalho (/contexto), onde a lista de filiais é aberta entre as autorizadas
  // do perfil.

  // Reset loading state when database mode changes to prevent "stuck" UI
  React.useEffect(() => {
    setIsLoading(false);
    setError(null);
  }, [databaseMode]);

  const [hasBio, setHasBio] = useState(false);
  // Only the stable authenticate reference is needed — Login.tsx manages
  // its own loading/error state for the entire multi-path auth flow.
  // Passing false to useLocalAuth skips its internal setState calls,
  // avoiding 2 wasted re-renders per Dexie auth call.
  const { authenticate: localAuthenticate } = useLocalAuth(false);

  // Boas práticas React: derive during render, no useMemo for simple primitives
  // (rerender-simple-expression-in-memo)
  const normalizedUsername = username.trim().toLowerCase();

  // Check for biometrics when username changes
  // Boas práticas React: Lazy state init for derived async state
  // (rerender-lazy-state-init, rerender-split-combined-hooks)
  React.useEffect(() => {
    let cancelled = false;
    const checkBio = async () => {
      // Biometria é do APP MÓVEL: no navegador/desktop o botão nem aparece —
      // nem há cadastro a oferecer, mesmo que o sistema tenha Touch ID/Windows
      // Hello disponível.
      if (!isNativeAppShell() || normalizedUsername.length <= 3) {
        if (!cancelled) setHasBio(false);
        return;
      }
      const supported = await isBiometricSupported();
      if (cancelled) return;
      if (!supported) {
        setHasBio(false);
        return;
      }
      const registered = await hasBiometricRegistered(normalizedUsername);
      if (!cancelled) setHasBio(registered);
    };
    checkBio();
    return () => { cancelled = true; };
  }, [normalizedUsername]);

  // DESBLOQUEIO BIOMÉTRICO (primeira etapa no mobile): o último utilizador
  // autenticado neste aparelho abre a sessão pela biometria, sem teclado; a
  // senha fica como alternativa explícita («Usar senha»). Só no casco nativo —
  // no web sem autenticador o acesso continua a ser utilizador + senha.
  const [unlockUser, setUnlockUser] = useState<string | null>(null);
  const [unlockChecking, setUnlockChecking] = useState<boolean>(
    () => isNativeAppShell() && !!readLastLoginUser()
  );

  React.useEffect(() => {
    let cancelled = false;
    const resolveUnlock = async () => {
      if (!isNativeAppShell()) {
        if (!cancelled) setUnlockChecking(false);
        return;
      }
      const lastUser = readLastLoginUser();
      if (!lastUser) {
        if (!cancelled) setUnlockChecking(false);
        return;
      }
      try {
        // A política exige capacidade + credencial NATIVA deste utilizador: um
        // registo feito no navegador não autentica no casco nativo.
        const facts = await checkNativeBiometry();
        const registered =
          facts.status === 'available' && (await hasBiometricRegistered(lastUser));
        if (!cancelled && canOfferBiometricUnlock({
          lastUser,
          isNativeApp: true,
          biometry: facts.status,
          registered
        })) {
          setUnlockUser(lastUser);
        }
      } catch (err) {
        logger.warn('[Login] Falha ao preparar o desbloqueio biométrico:', err);
      } finally {
        if (!cancelled) setUnlockChecking(false);
      }
    };
    resolveUnlock();
    return () => { cancelled = true; };
  }, []);

  /** Utilizador local por username OU e-mail, com a tabela física como reforço. */
  const findLocalUser = async (identifier: string): Promise<User | null> => {
    const normalized = normalizeUnlockUser(identifier);
    if (!normalized) return null;
    const matches = (u: User) =>
      normalizeUnlockUser(u.email) === normalized || normalizeUnlockUser(u.username) === normalized;
    const fromProps = users.find(matches);
    if (fromProps) return fromProps;
    try {
      const dbUsers = await localDb.users.toArray();
      return (dbUsers.find((u) => matches(u as User)) as User | undefined) ?? null;
    } catch (err) {
      logger.warn('[Login] Falha ao ler utilizadores locais para o desbloqueio:', err);
      return null;
    }
  };

  /**
   * Conclui a sessão local de uma entrada já verificada pela biometria e
   * memoriza o utilizador do aparelho para o próximo desbloqueio.
   */
  const completeBiometricLogin = (localUser: User, details: string) => {
    // Credencial local do app: não existe token do Supabase para validar.
    markAppManagedSession();
    sessionStorage.setItem('app_current_user', safeStringify(stripUserSecrets(localUser)));

    logAuditEvent({
      user_email: localUser.email,
      action: 'LOGIN',
      details,
      tenantid: localUser.tenantid
    });

    rememberLastLoginUser(localUser);
    onLogin(localUser);
  };

  /** Desbloqueio biométrico do último utilizador do aparelho. */
  const handleUnlockBiometric = async (unlockedUser: string) => {
    setIsLoading(true);
    try {
      const localUser = await findLocalUser(unlockedUser);
      if (localUser) {
        completeBiometricLogin(localUser, 'Login efetuado via Biometria (Desbloqueio do aparelho)');
        return;
      }
      // Sem perfil local não há sessão: cai para a senha, sem prender a tela.
      setUnlockUser(null);
      setUsername(unlockedUser);
      setError('Usuário biométrico não encontrado no banco local. Entre com a senha.');
    } finally {
      setIsLoading(false);
    }
  };

  /** Login por senha concluído: memoriza o utilizador para o próximo desbloqueio. */
  const finishPasswordLogin = (loggedUser: User) => {
    rememberLastLoginUser(loggedUser);
    onLogin(loggedUser);
  };

  const handleBiometricLogin = async () => {
    if (!username) return;

    try {
      setIsLoading(true);
      const success = await authenticateBiometric(normalizeUnlockUser(username));

      if (!success) {
        setError('Biometria não confirmada neste aparelho.');
        return;
      }

      const localUser = await findLocalUser(username);
      if (localUser) {
        completeBiometricLogin(localUser, 'Login efetuado via Biometria (Local)');
      } else {
        setError("Usuário biométrico não encontrado no banco local.");
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

          // Um único ponto de limpeza: também apaga a cópia com prazo da
          // sessão, senão o próximo arranque voltava a entrar sozinho.
          resetLocalAccessStorage();
          window.location.reload();
        } catch (err) {
          logger.error('Erro ao limpar sessão:', err);
          window.location.reload();
        }
      }
    });
  };

  const handleDemoMode = (): void => {
    logger.info(`[GBR ${APP_VERSION_LABEL}] Inicializando Modo Demo`);
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

  // Boas práticas React: derive during render, no redundant bool for simple checks
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
      logger.info(`>>> [MOBILE-SHIELD] Validando credenciais para: ${inputUser}`);

      // normalizedUsername (declarado na linha 56) é usado via closure —
      // evitamos redefini-lo aqui dentro para eliminar duplicação.

      // =======================================================
      // 1. VALIDAÇÃO OFFLINE VIA DEXIE.JS (localDb.users)
      // =======================================================
      const dexieAuthResult = await localAuthenticate(
        (criteria) => localDb.users.get(criteria) as unknown as Promise<Record<string, unknown> | null | undefined>,
        username,
        password,
      );

      if (dexieAuthResult.user) {
        logger.info('[DEXIE_AUTH] Usuário local localizado no Dexie. Montando escopo de acesso.');

        const localUser = dexieAuthResult.user as {
          email?: string;
          role?: string;
          tenantid?: string;
          is_admin?: boolean;
          isAdmin?: boolean;
        };

        const userRole = (localUser.role || '').toString().toUpperCase();
        const isMasterLike = userRole === 'MASTER' || userRole === 'ADMIN' || !!localUser.is_admin || !!localUser.isAdmin;
        // DONO GLOBAL: o perfil não declara contrato por desenho — o contrato é
        // escolhido em /contexto. Bloqueá-lo aqui contradizia o caminho da nuvem
        // (`!tenantid && !is_master`) e impedia o próprio dono de entrar.
        const isGlobalOwner = isAdminEmail(localUser.email);
        if (isMasterLike) {
          if (!localUser.tenantid && !isGlobalOwner) {
            throw new Error('Perfil MASTER sem tenantid vinculado no Supabase.');
          }
          sessionStorage.setItem('gbr_admin_scope', 'TENANT_MASTER');
          if (localUser.tenantid) sessionStorage.setItem('tenantid', localUser.tenantid);
        } else {
          sessionStorage.setItem('gbr_admin_scope', 'OPERATIONAL_AUDITOR');
          if (localUser.tenantid) sessionStorage.setItem('tenantid', localUser.tenantid);
        }

        const dexieUser = dexieAuthResult.user as unknown as User;
        sessionStorage.setItem('app_current_user', safeStringify(stripUserSecrets(dexieUser)));

        // FLUXO ÚNICO: autenticado, entra direto — contrato, filial e módulo
        // são escolhidos na tela de contrato de trabalho (/contexto). O login
        // local (Dexie/Barreira Local) não tem token do Supabase: a sessão é
        // marcada como gerida pelo app para a checagem da nuvem não destruí-la.
        markAppManagedSession();
        finishPasswordLogin(dexieUser);
        setIsLoading(false);
        clearTimeout(loginTimeout);
        return;
      }

      if (dexieAuthResult.error) {
        logger.warn('[DEXIE_AUTH] Erro na consulta Dexie.js, prosseguindo para próximas camadas:', dexieAuthResult.error);
      }

      const isMasterLocal = ((normalizedUsername === 'admin' || normalizedUsername === 'admin gbr' || isAdminEmail(normalizedUsername)) && 
                            password === 'admin') ||
                            (normalizedUsername === 'admin' && password === '123456');
      
      // Registo local pela identidade e, só depois, a senha pelo verificador
      // (hash + sal). `password` em texto só existe em registos antigos.
      const candidateLocalUser = users.find(u =>
        u.email.toLowerCase() === normalizedUsername || u.username.toLowerCase() === normalizedUsername
      );
      let matchedLocalUser = candidateLocalUser && (await verifyUserPassword(candidateLocalUser, password))
        ? candidateLocalUser
        : undefined;

      // BUSCA DIRETA NO SQlite SE O ARRAY DE PROPS ESTIVER VAZIO OU STALE
      if (!matchedLocalUser) {
        try {
          logger.info('[Login] [CHECK 1] Buscando usuário local na tabela física "users" do SQLite/localforage...');
          const dbUsers = await localDb.users.toArray();
          const candidateDbUser = dbUsers.find(u =>
            u.email.toLowerCase() === normalizedUsername || u.username.toLowerCase() === normalizedUsername
          );
          matchedLocalUser = candidateDbUser && (await verifyUserPassword(candidateDbUser, password))
            ? candidateDbUser
            : undefined;
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
            const roleUpper = String(loggedUser.role || '').toUpperCase();
            const isGlobalOwner = isAdminEmail(loggedUser.email);
            const isMasterLike = isGlobalOwner || !!loggedUser.is_admin || !!loggedUser.isAdmin ||
                                 roleUpper === 'ADMIN' || roleUpper === 'MASTER';
            if (!loggedUser.tenantid) {
              // REGRA SRE usuário×tenant: o app NUNCA aceita um perfil sem contrato
              // virando "GLOBAL" (dados de vários contratos misturados). A fonte da
              // verdade é o user_permissions na NUVEM — tenta resolver antes de
              // recorrer à sessão; admin/master sem tenant vinculado é BLOQUEADO.
              let cloudTenant = '';
              try {
                if (!isInternalMode && supabase) {
                  const cloudProfile = await ensureUserProfile(loggedUser.email, undefined, undefined);
                  cloudTenant = String(cloudProfile?.tenantid || '').trim();
                }
              } catch (cloudErr) {
                logger.warn('[Login] Falha ao resolver tenant do perfil na nuvem (Barreira Local):', cloudErr);
              }
              if (cloudTenant) {
                loggedUser.tenantid = cloudTenant;
              } else if (isGlobalOwner) {
                // DONO GLOBAL (VITE_ADMIN_EMAIL): sem contrato no perfil é o
                // estado normal — /contexto lista os contratos da base local.
                // Nunca herda tenant de storage/sessão anterior (seria um
                // contrato aleatório para um perfil global).
                logger.info(`[Login] Dono global sem tenantid no perfil — contrato será escolhido em /contexto: ${loggedUser.email}`);
                loggedUser.tenantid = '';
              } else if (isMasterLike) {
                logger.warn(`[Login] [CHECK 3] Bloqueando login de admin/master sem tenantid vinculado: ${loggedUser.email}`);
                setIsLoading(false);
                setError('Perfil de administrador sem tenantid vinculado. Contate o administrador para vincular seu contrato antes de logar.');
                clearTimeout(loginTimeout);
                return;
              } else {
                loggedUser.tenantid = readSessionTenantId() || readLocalTenantId() || '';
              }
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
              tenantid: readSessionTenantId() || readLocalTenantId() || '',
              filial: ''
            };
          } else {
            // Se for mestre mas não estiver cadastrado no array (ou tabela SQLite ainda vazia), criamos a sessão mestre inicial
            const adminUser = users.find(u => isAdminEmail(u.email));
            if (adminUser) {
              loggedUser = { ...adminUser };
            } else {
              loggedUser = {
                username: (ADMIN_EMAIL.split('@')[0] || 'admin'),
                name: 'Administrador Mestre',
                email: ADMIN_EMAIL || 'admin@system.local',
                role: UserRole.ADMIN,
                is_admin: true,
                isAdmin: true,
                mustChangePassword: false,
                tenantid: readSessionTenantId() || readLocalTenantId() || '',
                filial: ''
              };
            }
          }

          logger.info('[Login] Sucesso via Barreira Local! Sessão gerada:', loggedUser.email);
          sessionStorage.setItem('app_current_user', safeStringify(stripUserSecrets(loggedUser)));

          // FLUXO ÚNICO: autenticado na Barreira Local, entra direto; contrato,
          // filial e módulo são escolhidos na tela de contrato de trabalho.
          markAppManagedSession();
          finishPasswordLogin(loggedUser);
          clearTimeout(loginTimeout);
          return; // ENCERRA O FLUXO SEM COCORRER CÓDIGOS DO SUPABASE
        } catch (localErr: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          logger.error('[Login] Falha inesperada na barreira local:', localErr);
        }
      }

      // SOBERANIA LOCAL: só a AUSÊNCIA de credenciais bloqueia a tentativa na nuvem.
      // O modo gravado em `app_database_mode` pode ter ficado INTERNAL de uma sessão
      // offline/demo anterior, e nesse caso o login recusava um utilizador Supabase
      // válido com "a licença ativa é SOLO" — mesmo com URL e chave no bundle (o
      // badge da tela lê o ambiente; este guard lia o localStorage). A Barreira Local
      // já correu antes deste ponto, portanto quem autentica localmente continua a
      // entrar sem tocar na nuvem; aqui só se decide se vale tentar a nuvem.
      const isCloudMode = !isInternalMode;
      if (!isCloudMode) {
        logger.info('[Login] [CHECK 2] Licença SOLO/Local ativa (Soberania Offline). Bloqueando tentativa de autenticação direta no Supabase Cloud.');
        setIsLoading(false);
        setError("Usuário ou senha inválidos no banco de dados local. A licença ativa é SOLO (Offline-First).");
        clearTimeout(loginTimeout);
        return;
      }

      // Passo de Segurança: em modo de nuvem, verificamos se o cliente supabase existe
      if (isCloudMode && !supabase) {
        setIsLoading(false);
        setError("O Supabase não está configurado. Verifique as variáveis de ambiente (URL e Anon Key) nas configurações do projeto.");
        clearTimeout(loginTimeout);
        return;
      }

      let loggedUser: User | null = null;
      const isOnline = navigator.onLine;

      const doLocalAuthFallback = async (): Promise<User> => {
        logger.info('[Login] Autenticando via Banco Interno (Mobile Puro - Fallback)...');
        const localIdentifier = username.trim().toLowerCase();
        const candidateFallback = users.find(u =>
          u.email.toLowerCase() === localIdentifier || u.username.toLowerCase() === localIdentifier
        );
        const localUser = candidateFallback && (await verifyUserPassword(candidateFallback, password))
          ? candidateFallback
          : undefined;

        if (!localUser) {
          const isAdminFallback = (username.trim().toLowerCase() === 'admin gbr' || isAdminEmail(username.trim()) || username.trim().toLowerCase() === 'admin') && 
                                  password === 'admin';
          
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
                tenantid: '',
                filial: ''
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

          let tenantid = normalizeValue(cloudUser.tenantid || cloudUser.tenantid || cloudUser.tenantid || '');
          let unitId = normalizeValue(cloudUser.filial || cloudUser._unitid || cloudUser.unitid || '');

          if (is_master) {
            // DONO GLOBAL: tenant EXCLUSIVAMENTE do perfil (user_permissions).
            // Nunca de storage/cache de sessão anterior — o dono é GLOBAL e o
            // contrato é escolhido no seletor pós-login (multi-contrato).
            tenantid = normalizeValue(cloudUser.tenantid || '');
            unitId = 'TODAS';
          }

          // Filiais AUTORIZADAS do perfil: o administrador libera o auditor em
          // uma ou em VÁRIAS filiais. Elas seguem para o seletor de contrato
          // (/contexto), onde a escolha é aberta entre as autorizadas.
          const profileUnits = Array.from(new Set(
            (Array.isArray(cloudUser.units) ? (cloudUser.units as string[]) : [])
              .map((u) => String(u || '').trim().toUpperCase())
              .filter((u) => u && !['DEFAULT', 'NULL', '0', 'UNDEFINED', 'TODAS'].includes(u))
          ));
          const primaryUnit = String(unitId || '').trim().toUpperCase();
          if (primaryUnit && !['TODAS', 'DEFAULT', 'NULL', '0', 'UNDEFINED'].includes(primaryUnit)
            && !profileUnits.includes(primaryUnit)) {
            profileUnits.push(primaryUnit);
          }

          loggedUser = {
            username: finalUsername,
            name: cloudUser.name || finalUsername,
            email: cloudUser.email,
            role: cloudUser.role as UserRole,
            is_admin: is_admin,
            isAdmin: is_admin,
            mustChangePassword: false,
            tenantid: tenantid,
            filial: unitId,
            units: profileUnits
          };

          if (!tenantid && !is_master) {
            logger.warn('[Login] Bloqueando login pois tenantid está nulo ou vazio no perfil.');
            if (supabase) {
              await supabase.auth.signOut();
            }
            // Perfil inutilizável: não pode ficar guardado para o próximo arranque.
            clearPersistedSession();
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
              tenantid: loggedUser.tenantid,
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
            loggedUser = await doLocalAuthFallback();
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
        loggedUser = await doLocalAuthFallback();
      }


      if (loggedUser) {
        logger.info('[Login] Sucesso! Sessão local gerada para:', loggedUser.email);
        
        // Salva no sessionStorage para persistência (Token Local)
        sessionStorage.setItem('app_current_user', safeStringify(stripUserSecrets(loggedUser)));

        // FLUXO ÚNICO: segue para o log de auditoria e para o app; contrato,
        // filial e módulo são escolhidos na tela de contrato de trabalho.

        // Log de Auditoria Local
        logAuditEvent({
          user_email: loggedUser.email,
          action: 'LOGIN',
          details: `Login efetuado via ${(databaseMode as DatabaseMode) === DatabaseMode.SUPABASE ? 'Nuvem' : 'Banco Interno (Isolado)'}`,
          tenantid: loggedUser.tenantid
        });

        finishPasswordLogin(loggedUser);
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

  // Primeiro passo do acesso no mobile: a verificar credencial + biometria do
  // aparelho antes de mostrar o formulário (evita o flash da senha).
  if (unlockChecking) {
    return (
      <div className="w-full min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-6">
        <Loader2 size={28} className="animate-spin text-accent" />
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
          A verificar a segurança do aparelho...
        </p>
      </div>
    );
  }

  // Desbloqueio biométrico: último utilizador do aparelho, prompt automático e
  // «Usar senha» como alternativa. Nada aqui existe no web sem autenticador.
  if (unlockUser) {
    const unlockName = unlockUser;
    return (
      <BiometricUnlock
        username={unlockName}
        authenticate={authenticateBiometric}
        onUnlocked={() => handleUnlockBiometric(unlockName)}
        onUsePassword={() => {
          setUnlockUser(null);
          setUsername(unlockName);
          setError(null);
        }}
        onUseAnotherAccount={() => {
          // Segundo utilizador no mesmo aparelho: esquece o último utilizador
          // para o formulário não herdar o desbloqueio biométrico do anterior.
          // A credencial registada do anterior fica intacta no aparelho.
          forgetLastLoginUser();
          setUnlockUser(null);
          setUsername('');
          setPassword('');
          setError(null);
        }}
      />
    );
  }

  // Boas práticas React: use ternary for JSX conditionals (rendering-conditional-render)
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
          {/* Seletor de Ambiente Dinâmico — reflete o modo real (Supabase vs local) */}
          <div
            className="absolute top-0 right-0 bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-full flex items-center gap-1.5 z-[100] select-none"
          >
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isInternalMode ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            <span className="text-[7px] font-black text-slate-900 uppercase tracking-wider">
              AMBIENTE: {isInternalMode ? 'MOBILE (LOCAL)' : 'SUPABASE (WEB)'}
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
            VERSÃO {APP_VERSION} - GBR NATIVE READY
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
