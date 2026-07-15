import { getDemoSeedAssets } from './demoSeed';
import { localDb } from './localDbService';
import { User, UserRole } from '../types';

const DEMO_START_KEY = 'gbr_kardex_demo_start';
const DEMO_AUDIT_COUNT_KEY = 'gbr_kardex_demo_audits';

export const demoService = {
  getDemoUser: (): User => {
    return {
      id: 'demo_user_id',
      username: 'usuario_demo',
      name: 'Auditor Demo (Play Store)',
      email: 'demo@gbrauditoria.com.br',
      password: '',
      role: 'DEMO' as unknown as UserRole, // Role DEMO
      is_admin: false,
      isAdmin: false,
      mustChangePassword: false,
      _tenantid: 'DEMO_DEFAULT',
      _unitid: 'MATRIZ',
      tenantid: 'DEMO_DEFAULT',
      unitid: 'MATRIZ',
      units: ['MATRIZ'],
      tenants: ['DEMO_DEFAULT']
    };
  },

  initDemoSession: async (): Promise<boolean> => {
    // Grava a data de início se não houver
    if (!localStorage.getItem(DEMO_START_KEY)) {
      // Criptografia rudimentar (btoa do time milis) para desencorajar burlar
      const obfuscated = btoa(new Date().getTime().toString());
      localStorage.setItem(DEMO_START_KEY, obfuscated);
    }
    
    // Inicia contador de auditoria se não houver
    if (!localStorage.getItem(DEMO_AUDIT_COUNT_KEY)) {
      localStorage.setItem(DEMO_AUDIT_COUNT_KEY, '0');
    }

    // Carrega seed data no Dexie
    try {
      console.log('[Demo] Iniciando carga de demonstração com Dexie...');
      
      // Limpa quaisquer dados locais legados
      await localDb.assets.clear();
      await localDb.users.clear();

      // Insere o usuário com tratamento de colunas perfeito
      const demoUser = demoService.getDemoUser();
      await localDb.users.add(demoUser);

      // Insere o usuário administrador de backup de contingência nativa
      const backupAdminUser: User = {
        id: 'admin_backup_id',
        username: 'admin',
        name: 'Backup Administrator',
        email: 'admin@gbrauditoria.com.br',
        password: '123456',
        role: 'ADMIN' as unknown as UserRole,
        is_admin: true,
        isAdmin: true,
        _tenantid: 'DEMO_DEFAULT',
        _unitid: 'MATRIZ',
        tenantid: 'DEMO_DEFAULT',
        unitid: 'MATRIZ',
        units: ['MATRIZ'],
        tenants: ['DEMO_DEFAULT']
      };
      await localDb.users.add(backupAdminUser);

      // Insere a massa de ativos demonstrativos (50+ ativos) respeitando o isolamento
      const seedAssets = getDemoSeedAssets();
      const activeTenant = 'DEMO_DEFAULT';
      
      const mappedAssets = seedAssets.map(asset => {
        return {
          ...asset,
          tenantId: activeTenant,
          _tenantid: activeTenant,
          tenant_id: activeTenant,
          filial: asset.filial || 'MATRIZ',
          _unitid: asset.filial || 'MATRIZ'
        };
      });

      // Alimentando o schema utilizando o método fatiado de 200 registros (bulkPut)
      for (let i = 0; i < mappedAssets.length; i += 200) {
        const chunk = mappedAssets.slice(i, i + 200);
        await localDb.assets.bulkPut(chunk);
      }

      console.log('[Demo Success] Carga concluída! 50+ ativos fictícios e usuário demo implantados com sucesso via Dexie.');
      return true;
    } catch (err) {
      console.error('[Demo Ultimate Error] Falha na inicialização do Demo local:', err);
      
      // SALVA O LOG DE TELEMETRIA LOCAL
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      localStorage.setItem('gbr_kardex_last_db_error', JSON.stringify({
        message: errorMsg,
        stack: errorStack,
        timestamp: new Date().toISOString()
      }));

      return false;
    }
  },

  checkDemoStatus: (): { expired: boolean; reason?: 'days' | 'audits' | null; daysLeft: number; auditsCount: number } => {
    const obfuscated = localStorage.getItem(DEMO_START_KEY);
    if (!obfuscated) {
      return { expired: false, daysLeft: 7, auditsCount: 0 };
    }

    let startMs: number;
    try {
      startMs = parseInt(atob(obfuscated), 10);
      if (isNaN(startMs)) startMs = new Date().getTime();
    } catch {
      startMs = new Date().getTime();
    }

    const elapsedMs = new Date().getTime() - startMs;
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
    const daysLeft = Math.max(0, parseFloat((7 - elapsedDays).toFixed(1)));

    const auditsCount = parseInt(localStorage.getItem(DEMO_AUDIT_COUNT_KEY) || '0', 10);

    if (elapsedDays > 7) {
      return { expired: true, reason: 'days', daysLeft: 0, auditsCount };
    }

    if (auditsCount >= 30) {
      return { expired: true, reason: 'audits', daysLeft, auditsCount };
    }

    return { expired: false, daysLeft, auditsCount };
  },

  incrementAuditCount: (): number => {
    const count = parseInt(localStorage.getItem(DEMO_AUDIT_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(DEMO_AUDIT_COUNT_KEY, count.toString());
    return count;
  }
};

