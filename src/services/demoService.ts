import { getDemoSeedAssets } from './demoSeed';
import { getUpsertSql } from './localDbService';
import { sqliteService } from './sqliteService';
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

    // Carrega seed data no SQLite
    try {
      console.log('[Demo] Garantindo inicialização física estrita do SQLite...');
      // 1. Ciclo de Vida: aguarda estritamente a inicialização do sqliteService
      await sqliteService.init();

      console.log('[Demo] Iniciando transação atômica para ejetar dados...');
      
      // 2. Transação Blindada: BEGIN TRANSACTION
      await sqliteService.execute("BEGIN TRANSACTION;");

      try {
        // Limpa quaisquer dados locais legados
        await sqliteService.execute("DELETE FROM ativos");
        await sqliteService.execute("DELETE FROM users");

        // Insere o usuário com tratamento de colunas perfeito
        const demoUser = demoService.getDemoUser();
        const userUpsert = getUpsertSql('users', demoUser as unknown as Record<string, unknown>);
        await sqliteService.execute(userUpsert.sql, userUpsert.values);

        // Insere a massa de ativos demonstrativos (50+ ativos)
        const seedAssets = getDemoSeedAssets();
        for (const asset of seedAssets) {
          const assetUpsert = getUpsertSql('ativos', asset as unknown as Record<string, unknown>);
          await sqliteService.execute(assetUpsert.sql, assetUpsert.values);
        }

        // COMMIT
        await sqliteService.execute("COMMIT;");
        console.log('[Demo Success] Transação concluída! 50+ ativos fictícios e usuário demo implantados com sucesso.');
        
        // Persiste as sessões
        await sqliteService.saveDatabase();
        return true;
      } catch (innerError) {
        console.error('[Demo Block Error] Falha interna ao processar injeção do Demo. Desfazendo alterações (ROLLBACK)...', innerError);
        try {
          await sqliteService.execute("ROLLBACK;");
        } catch (rollbackErr) {
          console.warn('[Demo Rollback Error] Não foi possível fazer rollback da transação:', rollbackErr);
        }
        throw innerError;
      }
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

      // 🛡️ 2. Mecanismo Failsafe de Autocura (Recuperação Automática com fallback em Memória)
      try {
        console.warn('[Demo Failsafe] Executando plano de autocura: eliminando banco corrompido e restaurando com motor em memória...');
        
        // Reseta o serviço e inicializa com força para carregar MemoryDatabaseConnection
        await sqliteService.reset();
        await sqliteService.init(true);

        // Injeta os dados limpos no banco em memória
        await sqliteService.execute("DELETE FROM ativos");
        await sqliteService.execute("DELETE FROM users");

        const demoUser = demoService.getDemoUser();
        const userUpsert = getUpsertSql('users', demoUser as unknown as Record<string, unknown>);
        await sqliteService.execute(userUpsert.sql, userUpsert.values);

        const seedAssets = getDemoSeedAssets();
        for (const asset of seedAssets) {
          const assetUpsert = getUpsertSql('ativos', asset as unknown as Record<string, unknown>);
          await sqliteService.execute(assetUpsert.sql, assetUpsert.values);
        }

        console.log('[Demo Failsafe Success] Dispositivo recuperado com sucesso via contingência em Memória.');
        return true;
      } catch (failsafeErr) {
        console.error('[Demo Failsafe Crash] Falha dramática no fallback em memória:', failsafeErr);
        localStorage.setItem('gbr_kardex_last_db_error', JSON.stringify({
          message: `CRITICAL FAILSAFE CRASH: ${failsafeErr instanceof Error ? failsafeErr.message : String(failsafeErr)}`,
          timestamp: new Date().toISOString()
        }));
        return false;
      }
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
