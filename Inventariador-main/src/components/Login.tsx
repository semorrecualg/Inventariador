
import React, { useState } from 'react';
import { UserCircle, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck, Fingerprint, ShieldAlert, Sparkles, Building2, CheckCircle2, DownloadCloud, CloudOff } from 'lucide-react';
import { isAdminEmail, markAppManagedSession, ADMIN_EMAIL } from '../utils/authUtils';
import { useLocalAuth } from '../hooks/useLocalAuth';
import { supabase, ensureUserProfile, logAuditEvent, getEmailByUsername, isInternalMode, downloadBaseToLocal, fetchTenantFiliais } from '../services/supabaseService';
import type { TenantFilial } from '../services/supabaseService';
import { db } from '../services/sqliteService';
import { authenticateBiometric, hasBiometricRegistered, isBiometricSupported } from '../services/biometricService';
import { User, DatabaseMode, UserRole, AppScreen, ModalConfig } from '../types';
import { safeStringify } from '../services/utils';
import { localDb } from '../services/localDbService';
import { demoService } from '../services/demoService';
import pkg from '../../package.json';
import { logger } from '../utils/logger';
import { readSessionTenantId, readLocalTenantId } from '../utils/tenantUtils';

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
  const [downloadingBase, setDownloadingBase] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clickCount, setClickCount] = useState(0);

  // ETAPA 2/2 (FLUXO UNIFICADO): após validar credenciais (nuvem OU cadastro local),
  // o usuário vê o contrato (tenantid) e escolhe a(s) filial(is) de atuação — com
  // lazy-loading paginado das filiais do banco — e acompanha a carga seletiva
  // (downloadBaseToLocal) com progresso antes de iniciar o inventário.
  const BRANCH_PAGE_SIZE = 20;
  const [loginStage, setLoginStage] = useState<'credentials' | 'branch'>('credentials');
  const [pendingCloudUser, setPendingCloudUser] = useState<User | null>(null);
  const [pendingIsMaster, setPendingIsMaster] = useState(false);
  // true = usuário validado no cadastro LOCAL (Barreira Local / fallback offline):
  // a base já está no dispositivo, então a confirmação não baixa nada da nuvem.
  const [pendingIsLocal, setPendingIsLocal] = useState(false);
  // Filiais do contrato carregadas do banco (nuvem + local + perfil), com paginação.
  const [tenantFiliais, setTenantFiliais] = useState<TenantFilial[]>([]);
  const [visibleFiliais, setVisibleFiliais] = useState<TenantFilial[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const [allBranches, setAllBranches] = useState(false); // TODAS as filiais do contrato

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
          // Credencial local do app: não existe token do Supabase para validar.
          markAppManagedSession();
          sessionStorage.setItem('app_current_user', safeStringify(localUser));
          
          // Log de Auditoria
          logAuditEvent({
            user_email: localUser.email,
            action: 'LOGIN',
            details: 'Login efetuado via Biometria (Local)',
            tenantid: localUser.tenantid
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

  // =======================================================
  // ETAPA 2/2 (FLUXO UNIFICADO): contrato + seleção de filial(is) + carga seletiva
  // =======================================================
  const persistBranchSelection = (branches: string[], all: boolean) => {
    // A filial "primária" alimenta as chaves legadas de contexto (unidade de trabalho).
    const branch = all || branches.length === 0 ? '' : branches[0];
    if (!branch || branch === 'TODAS') return;
    try {
      localStorage.setItem('selectedUnit', branch);
      sessionStorage.setItem('selectedUnit', branch);
      localStorage.setItem('app_selected_unit', branch);
      localStorage.setItem('app_current_unit', branch);
      localStorage.setItem('filial', branch);
      sessionStorage.setItem('filial', branch);
    } catch (storageErr) {
      logger.warn('[Login] Falha ao persistir filial selecionada:', storageErr);
    }
  };

  /**
   * Pausa o fluxo na ETAPA 2/2 (tela de login): mostra o contrato (tenantid) e a
   * lista lazy-loading de filiais do banco, permitindo a carga seletiva por
   * [tenantid + filiais] antes de iniciar o inventário. Sem contrato resolvível
   * (dono global), segue direto — o contrato é escolhido no pós-login.
   */
  const enterBranchStage = (user: User, profileUnits: string[], isMaster: boolean, isLocal: boolean) => {
    const tenant = String(user.tenantid || '').trim().toUpperCase();
    if (!tenant) {
      if (isLocal) markAppManagedSession();
      onLogin(user);
      return;
    }
    setPendingCloudUser(user);
    setPendingIsMaster(isMaster);
    setPendingIsLocal(isLocal);
    setError(null);
    // Pré-seleção: master → TODAS; auditor com UMA filial autorizada → ela;
    // múltiplas → a primeira; nenhuma → TODAS (fallback seguro de escopo).
    const units = (profileUnits || [])
      .map((u) => String(u || '').trim().toUpperCase())
      .filter((u) => u && !['DEFAULT', 'NULL', '0', 'UNDEFINED', 'TODAS'].includes(u));
    if (isMaster || units.length === 0) {
      setSelectedBranches(new Set());
      setAllBranches(true);
    } else {
      setSelectedBranches(new Set([units[0]]));
      setAllBranches(false);
    }
    setLoginStage('branch');
    setIsLoading(false);
    void loadTenantFiliais(tenant, units);
  };

  // Carrega as filiais do contrato (banco nuvem → fallback local → perfil) e
  // reinicia a paginação lazy-loading da lista.
  const loadTenantFiliais = async (tenant: string, profileUnits: string[]) => {
    setBranchLoading(true);
    try {
      const all = await fetchTenantFiliais(tenant, { profileUnits });
      setTenantFiliais(all);
      setVisibleFiliais(all.slice(0, BRANCH_PAGE_SIZE));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('[Login] Falha ao carregar filiais do contrato:', errMsg);
      const fallback = profileUnits.map((u) => ({
        filial: u.trim().toUpperCase(),
        tenantid: tenant,
        source: 'profile' as const,
      }));
      setTenantFiliais(fallback);
      setVisibleFiliais(fallback.slice(0, BRANCH_PAGE_SIZE));
    } finally {
      setBranchLoading(false);
    }
  };

  // Paginação (Lazy Loading): ao rolar até o fim da lista, carrega a próxima
  // página de filiais do contrato.
  const handleBranchScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (branchLoading || visibleFiliais.length >= tenantFiliais.length) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      setVisibleFiliais((prev) => {
        const next = tenantFiliais.slice(0, prev.length + BRANCH_PAGE_SIZE);
        return next.length > prev.length ? next : prev;
      });
    }
  };

  const toggleBranch = (filial: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(filial)) next.delete(filial);
      else next.add(filial);
      return next;
    });
    setAllBranches(false);
  };

  const toggleAllBranches = () => {
    setAllBranches((prev) => {
      if (!prev) setSelectedBranches(new Set());
      return !prev;
    });
  };

  const handleConfirmBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingCloudUser || !pendingCloudUser.tenantid) return;

    const tenantId = String(pendingCloudUser.tenantid).trim().toUpperCase();
    const branchList = allBranches ? [] : Array.from(selectedBranches);
    const primaryBranch = branchList[0] || '';
    const userWithBranch: User = {
      ...pendingCloudUser,
      filial: primaryBranch || pendingCloudUser.filial,
      units: branchList.length ? branchList : pendingCloudUser.units
    };

    persistBranchSelection(branchList, allBranches);
    sessionStorage.setItem('app_current_user', safeStringify(userWithBranch));

    // Caminho LOCAL (Barreira Local / fallback offline): a base já está no
    // dispositivo — nenhum download; entra direto com a filial escolhida.
    if (pendingIsLocal) {
      // Login por credencial local (Base Local / Barreira Local / Dexie):
      // marca a origem para que a checagem de sessão da nuvem não destrua
      // um acesso que não tem (nem precisa de) token do Supabase.
      markAppManagedSession();
      logAuditEvent({
        user_email: userWithBranch.email,
        action: 'LOGIN',
        details: `Login local efetuado (etapa 2/2 — filial: ${primaryBranch || 'TODAS'})`,
        tenantid: tenantId
      });
      onLogin(userWithBranch);
      return;
    }

    setDownloadingBase(true);
    setDownloadProgress(0);
    setError(null);

    try {
      // REGRA DE OURO (escopo multi-tenant): só baixa as filiais escolhidas que
      // ainda não existirem localmente (par [tenantid+filial]). Contagem global
      // vazaria o isolamento entre contratos em dispositivo multi-contrato.
      const missing: string[] = [];
      if (branchList.length > 0) {
        for (const b of branchList) {
          const count = await db.local_assets.where('[tenantid+filial]').equals([tenantId, b]).count();
          if (count === 0) missing.push(b);
        }
      } else {
        // TODAS selecionadas: se o contrato ainda não tem NADA local, baixa a
        // base completa; caso contrário, nada a fazer (já está no dispositivo).
        const localCount = await db.local_assets
          .filter((a) => String(a.tenantid || '').trim().toUpperCase() === tenantId)
          .count();
        if (localCount === 0) {
          logger.info(`[Login] [ETAPA 2/2] Baixando base completa do contrato ${tenantId} (TODAS as filiais)...`);
          await downloadBaseToLocal(tenantId, undefined, (processed, total) => {
            setDownloadProgress(total > 0 ? Math.round((processed / total) * 100) : 100);
          });
        } else {
          logger.info(`[Login] Base local já presente (${localCount} registros do contrato ${tenantId}) — pulando download.`);
        }
      }
      if (branchList.length > 0 && missing.length > 0) {
        logger.info(`[Login] [ETAPA 2/2] Baixando base do contrato ${tenantId} (filiais: ${missing.join(' | ')})...`);
        await downloadBaseToLocal(tenantId, missing, (processed, total) => {
          setDownloadProgress(total > 0 ? Math.round((processed / total) * 100) : 100);
        });
        logger.info(`[Login] Base do contrato ${tenantId} baixada com sucesso (filiais: ${missing.join(' | ')}).`);
      }

      logAuditEvent({
        user_email: userWithBranch.email,
        action: 'LOGIN',
        details: `Login efetuado via Nuvem (etapa 2/2 — filiais: ${branchList.length ? branchList.join(' | ') : 'TODAS'})`,
        tenantid: tenantId
      });

      onLogin(userWithBranch);
    } catch (err: unknown) {
      const dlMsg = err instanceof Error ? err.message : String(err);
      logger.warn('[Login] Falha na carga seletiva da filial (pode tentar novamente ou entrar sem sincronizar):', dlMsg);
      setError(`Falha no sincronismo da filial: ${dlMsg}`);
    } finally {
      setDownloadingBase(false);
    }
  };

  const handleSkipSync = () => {
    if (!pendingCloudUser) return;
    const branchList = allBranches ? [] : Array.from(selectedBranches);
    const primaryBranch = branchList[0] || '';
    const userWithBranch: User = {
      ...pendingCloudUser,
      filial: primaryBranch || pendingCloudUser.filial,
      units: branchList.length ? branchList : pendingCloudUser.units
    };
    persistBranchSelection(branchList, allBranches);
    sessionStorage.setItem('app_current_user', safeStringify(userWithBranch));
    logAuditEvent({
      user_email: userWithBranch.email,
      action: 'LOGIN',
      details: `Login efetuado via Nuvem (etapa 2/2 — sem sincronismo imediato, filiais: ${branchList.length ? branchList.join(' | ') : 'TODAS'})`,
      tenantid: String(userWithBranch.tenantid || '').trim().toUpperCase()
    });
    onLogin(userWithBranch);
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
          role?: string;
          tenantid?: string;
          is_admin?: boolean;
          isAdmin?: boolean;
        };

        const userRole = (localUser.role || '').toString().toUpperCase();
        const isMasterLike = userRole === 'MASTER' || userRole === 'ADMIN' || !!localUser.is_admin || !!localUser.isAdmin;
        if (isMasterLike) {
          if (!localUser.tenantid) throw new Error('Perfil MASTER sem tenantid vinculado no Supabase.');
          sessionStorage.setItem('gbr_admin_scope', 'TENANT_MASTER');
          sessionStorage.setItem('tenantid', localUser.tenantid);
        } else {
          sessionStorage.setItem('gbr_admin_scope', 'OPERATIONAL_AUDITOR');
          if (localUser.tenantid) sessionStorage.setItem('tenantid', localUser.tenantid);
        }

        const dexieUser = dexieAuthResult.user as unknown as User;
        sessionStorage.setItem('app_current_user', safeStringify(dexieUser));

        // Mesmo fluxo da Barreira Local: com contrato definido, o perfil escolhe
        // a filial (etapa 2/2) antes de entrar. Antes daqui chamávamos onLogin
        // direto e, para um auditor criado no app, a tela ficava parada no
        // formulário de login — o acesso existia mas não entrava.
        const dexieUnits = dexieUser.units || (dexieUser.unitid ? [dexieUser.unitid] : []);
        enterBranchStage(dexieUser, dexieUnits, isMasterLike, true);
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
            const roleUpper = String(loggedUser.role || '').toUpperCase();
            const isMasterLike = isAdminEmail(loggedUser.email) || !!loggedUser.is_admin || !!loggedUser.isAdmin ||
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
          sessionStorage.setItem('app_current_user', safeStringify(loggedUser));

          // ETAPA 2/2 também no caminho local: com tenantid resolvido, mostra o
          // contrato + filiais (do banco local) na tela de login antes de entrar;
          // sem contrato (dono global), enterBranchStage chama onLogin direto.
          const localIsMaster = isAdminEmail(loggedUser.email) || !!loggedUser.is_admin || !!loggedUser.isAdmin ||
            ['ADMIN', 'MASTER'].includes(String(loggedUser.role || '').toUpperCase());
          const localUnits = loggedUser.units || (loggedUser.unitid ? [loggedUser.unitid] : []);
          enterBranchStage(loggedUser, localUnits, localIsMaster, true);
          clearTimeout(loginTimeout);
          return; // ENCERRA O FLUXO SEM COCORRER CÓDIGOS DO SUPABASE
        } catch (localErr: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          logger.error('[Login] Falha inesperada na barreira local:', localErr);
        }
      }

      // SOBERANIA LOCAL: apenas os modos INTERNAL bloqueiam autenticação via nuvem.
      // SUPABASE e SUPABASE_PLUS são ambos modos de nuvem — o processSession persiste
      // 'SUPABASE' após autenticar no Supabase (ver App.tsx), então exigir PLUS aqui
      // impedia o login manual na segunda sessão (falso "Supabase desligado").
      const isCloudMode = databaseMode === DatabaseMode.SUPABASE || databaseMode === DatabaseMode.SUPABASE_PLUS;
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
      let cloudUnits: string[] | undefined;
      const isOnline = navigator.onLine;

      const doLocalAuthFallback = (): User => {
        logger.info('[Login] Autenticando via Banco Interno (Mobile Puro - Fallback)...');
        const localUser = users.find(u => 
          (u.email.toLowerCase() === username.trim().toLowerCase() || u.username.toLowerCase() === username.trim().toLowerCase()) && 
          u.password === password
        );

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

          loggedUser = {
            username: finalUsername,
            name: cloudUser.name || finalUsername,
            email: cloudUser.email,
            role: cloudUser.role as UserRole,
            is_admin: is_admin,
            isAdmin: is_admin,
            mustChangePassword: false,
            tenantid: tenantid,
            filial: unitId
          };

          if (!tenantid && !is_master) {
            logger.warn('[Login] Bloqueando login pois tenantid está nulo ou vazio no perfil.');
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
              tenantid: loggedUser.tenantid,
              filial: loggedUser.filial
            };
            logger.info('[Login] Gravando perfil nas credenciais locais do SQLite para uso offline...', userToPersist.email);
            await localDb.users.add(userToPersist as unknown as User);
          } catch (dbPersistErr) {
            logger.warn('[Login] Falha ao persistir perfil de usuário no SQLite local:', dbPersistErr);
          }

          // Sanitização SRE: sentinelas DEFAULT/NULL/0/UNDEFINED nunca viram opção de filial.
          // Para MASTER, 'TODAS' também é filtrado — a opção "Todas as filiais do contrato"
          // já representa o escopo global e evita opção duplicada no <select>.
          const rawCloudUnits = Array.isArray(cloudUser.units)
            ? (cloudUser.units as string[]).map(u => String(u).trim().toUpperCase())
            : unitId
              ? [unitId]
              : [];
          cloudUnits = Array.from(new Set(
            rawCloudUnits.filter(u => u && !['DEFAULT', 'NULL', '0', 'UNDEFINED'].includes(u) && !(is_master && u === 'TODAS'))
          ));

          // ETAPA 2/2 (FLUXO UNIFICADO): autenticado na nuvem com contrato resolvível —
          // pausa o fluxo para o usuário ver o contrato, escolher a(s) filial(is) do
          // banco e acompanhar a carga seletiva (lazy-loading). A REGRA DE OURO
          // (baixar base quando dispositivo vazio) ocorre em handleConfirmBranch; erro
          // de download NÃO bloqueia o login (skip disponível). Dono global sem
          // tenantid no perfil NÃO entra nesta etapa: segue direto para o pós-login,
          // onde o contrato é escolhido no UNIT_SELECTION (fluxo antigo).
          if (tenantid) {
            clearTimeout(loginTimeout);
            enterBranchStage(loggedUser, cloudUnits || [], is_master, false);
            return;
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

      // ETAPA 2/2 (FLUXO UNIFICADO): a carga seletiva com progresso agora ocorre em
      // handleConfirmBranch (filial escolhida pelo usuário). O download automático
      // silencioso foi removido daqui — erro de download não bloqueia o login.

      if (loggedUser) {
        logger.info('[Login] Sucesso! Sessão local gerada para:', loggedUser.email);
        
        // Salva no sessionStorage para persistência (Token Local)
        sessionStorage.setItem('app_current_user', safeStringify(loggedUser));

        // ETAPA 2/2 também aqui: usuário local/fallback com tenantid resolvível
        // escolhe a filial (do banco local) antes de entrar; sem contrato, segue
        // direto (dono global escolhe o contrato no pós-login).
        const tailTenant = String(loggedUser.tenantid || '').trim().toUpperCase();
        if (tailTenant) {
          const fbUnits = loggedUser.units || (loggedUser.unitid ? [loggedUser.unitid] : []);
          const fbIsMaster = isAdminEmail(loggedUser.email) || !!loggedUser.is_admin || !!loggedUser.isAdmin ||
            ['ADMIN', 'MASTER'].includes(String(loggedUser.role || '').toUpperCase());
          enterBranchStage(loggedUser, fbUnits, fbIsMaster, true);
          clearTimeout(loginTimeout);
          setIsLoading(false);
          return;
        }

        // Log de Auditoria Local
        logAuditEvent({
          user_email: loggedUser.email,
          action: 'LOGIN',
          details: `Login efetuado via ${(databaseMode as DatabaseMode) === DatabaseMode.SUPABASE ? 'Nuvem' : 'Banco Interno (Isolado)'}`,
          tenantid: loggedUser.tenantid
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

      {loginStage === 'branch' && pendingCloudUser ? (
        <form onSubmit={handleConfirmBranch} className="space-y-3.5 max-w-sm mx-auto w-full animate-fadeIn">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-[10px] font-black uppercase flex items-center mb-4 tracking-widest shadow-md animate-shake">
              <AlertCircle size={16} className="mr-3 shrink-0" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 justify-center mb-1">
            <span className="text-[9px] font-black text-accent uppercase tracking-widest">Etapa 2 de 2</span>
            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">· Escolha a filial</span>
          </div>

          <div className="bg-accent/10 border border-accent/20 rounded-2xl p-3.5 flex items-center gap-3">
            <Building2 size={20} className="text-accent shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Contrato Autenticado</span>
              <span className="text-xs font-extrabold text-slate-900 truncate">{String(pendingCloudUser.tenantid || '').toUpperCase()}</span>
              <span className="text-[9px] font-semibold text-slate-500 truncate">{pendingCloudUser.email}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
              Filiais do contrato ({tenantFiliais.length})
            </label>
            <div className="relative group">
              {/* Lista lazy-loading (paginação): carrega mais filiais ao rolar */}
              <div
                data-testid="branch-list"
                onScroll={handleBranchScroll}
                className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100 no-scrollbar"
              >
                {(pendingIsMaster || (tenantFiliais.length === 0 && !branchLoading)) && (
                  <button
                    type="button"
                    onClick={toggleAllBranches}
                    disabled={downloadingBase}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all cursor-pointer ${allBranches ? 'bg-accent/10' : 'hover:bg-slate-50'}`}
                  >
                    <Building2 size={16} className={`shrink-0 ${allBranches ? 'text-accent' : 'text-slate-300'}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12px] font-extrabold text-slate-900 truncate">TODAS AS FILIAIS DO CONTRATO</span>
                      <span className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Escopo global do contrato</span>
                    </span>
                    {allBranches ? <CheckCircle2 size={18} className="text-accent shrink-0" /> : <span className="w-[18px] shrink-0" />}
                  </button>
                )}
                {visibleFiliais.map((f) => {
                  const isSelected = allBranches || selectedBranches.has(f.filial);
                  return (
                    <button
                      type="button"
                      key={f.filial}
                      onClick={() => toggleBranch(f.filial)}
                      disabled={downloadingBase}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all cursor-pointer ${isSelected ? 'bg-accent/10' : 'hover:bg-slate-50'}`}
                    >
                      <Building2 size={16} className={`shrink-0 ${isSelected ? 'text-accent' : 'text-slate-300'}`} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] font-extrabold text-slate-900 truncate">{f.filial}</span>
                        <span className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                          {typeof f.assetCount === 'number' ? `${f.assetCount.toLocaleString('pt-BR')} ativos` : 'Filial do contrato'}
                          {f.source === 'profile' ? ' · autorizada no perfil' : ''}
                        </span>
                      </span>
                      {isSelected ? <CheckCircle2 size={18} className="text-accent shrink-0" /> : <span className="w-[18px] shrink-0" />}
                    </button>
                  );
                })}
                {branchLoading && (
                  <div className="flex items-center justify-center gap-2 py-4 text-accent">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Carregando filiais...</span>
                  </div>
                )}
                {!branchLoading && tenantFiliais.length === 0 && (
                  <div className="px-4 py-5 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhuma filial encontrada no banco</p>
                    <p className="text-[8px] font-semibold text-slate-300 uppercase tracking-wider mt-1">O contrato autenticado define o escopo</p>
                  </div>
                )}
                {!branchLoading && visibleFiliais.length >= tenantFiliais.length && tenantFiliais.length > 0 && (
                  <div className="px-4 py-2.5 text-center">
                    <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">
                      {tenantFiliais.length} {tenantFiliais.length === 1 ? 'filial' : 'filiais'} · rolar para carregar mais
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {downloadingBase && (
            <div className="space-y-1.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin text-accent" />
                  Sincronizando base
                </span>
                <span className="text-[10px] font-black text-accent">{downloadProgress}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={downloadingBase || (!pendingIsLocal && !allBranches && selectedBranches.size === 0)}
            className="w-full bg-accent text-white font-extrabold py-4 rounded-2xl shadow-md hover:shadow-lg hover:brightness-105 active:scale-[0.98] transition-all mt-4 uppercase tracking-[0.15em] text-xs flex items-center justify-center space-x-2 disabled:opacity-70 cursor-pointer"
          >
            {downloadingBase ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Sincronizando... {downloadProgress}%</span>
              </>
            ) : pendingIsLocal ? (
              <>
                <Building2 size={16} />
                <span>Acessar com a filial selecionada</span>
              </>
            ) : (
              <>
                <DownloadCloud size={16} />
                <span>Sincronizar e Acessar</span>
              </>
            )}
          </button>

          {!pendingIsLocal && (
            <button
              type="button"
              onClick={handleSkipSync}
              disabled={downloadingBase}
              className="w-full bg-transparent border border-slate-300 hover:border-accent hover:bg-slate-50 text-slate-700 hover:text-accent font-bold py-3.5 rounded-2xl shadow-sm active:scale-[0.98] transition-all mt-2 uppercase tracking-[0.1em] text-[11px] flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <CloudOff size={14} />
              <span>Entrar sem sincronizar agora</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => { setLoginStage('credentials'); setError(null); }}
            disabled={downloadingBase}
            className="w-full text-center text-[10px] font-bold text-slate-500 hover:text-accent uppercase tracking-widest transition-colors mt-1 cursor-pointer disabled:opacity-50"
          >
            ← Trocar credenciais
          </button>
        </form>
      ) : (
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
      )}

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
