import { supabase } from './supabaseService';
import { localDb } from './localDbService';
import { db } from './sqliteService';
import { logger } from '../utils/logger';

export const backupService = {
  /**
   * Realiza backup automatizado em background para usuários MOBILE_SINGLE
   */
  performMobileSingleBackup: async (userId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!navigator.onLine) {
        return { success: false, error: 'Dispositivo em modo offline' };
      }

      logger.info(`>>> [Backup Service] Iniciando backup automático em cloud para o usuário: ${userId}`);

      // 1. Coleta dados locais de ativos de forma limpa
      const assets = await localDb.assets.toArray();
      
      // 2. Coleta histórico de logs de auditoria locais usando Dexie
      const auditLogs = await db.audit_logs.toArray() || [];

      // 3. Estrutura o backup com metadados de integridade e timestamp
      const backupPayload = {
        userId,
        timestamp: new Date().toISOString(),
        version: 'v24.50.2',
        stats: {
          assetsCount: assets.length,
          logsCount: auditLogs.length
        },
        data: {
          assets,
          auditLogs
        }
      };

      const backupString = JSON.stringify(backupPayload, null, 2);
      const backupBlob = new Blob([backupString], { type: 'application/json' });
      const filePath = `backups/${userId}/backup_v24.json`;

      // 4. Salva a cópia estruturada diretamente no bucket do Supabase
      const { error: uploadError } = await supabase.storage
        .from('asset-photos') // Reutiliza o bucket de mídia homologado, evitando falha de falta de bucket personalizado.
        .upload(filePath, backupBlob, {
          contentType: 'application/json',
          upsert: true
        });

      if (uploadError) {
        throw uploadError;
      }

      logger.info(`>>> [Backup Service Success] Backup automático concluído com sucesso para o arquivo: ${filePath}`);
      return { success: true };
    } catch (err) {
      logger.error('>>> [Backup Service Fail] Erro crítico no backup automatizado do usuário:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
};
