import { localDb } from './localDbService';
import { Asset } from '../types';
import { logger } from '../utils/logger';

export const auditService = {
  /**
   * Compara o ativo original com o editado, calcula o delta e grava o log no Dexie (AUDIT_LOG)
   */
  logAssetChange: async (
    userEmail: string,
    originalAsset: Asset,
    updatedAsset: Asset
  ): Promise<{ hasChanges: boolean }> => {
    const oldData: Record<string, unknown> = {};
    const newData: Record<string, unknown> = {};
    let hasChanges = false;

    for (const key in updatedAsset) {
      if (Object.prototype.hasOwnProperty.call(updatedAsset, key)) {
        if (key.startsWith('_') || key === 'last_update') continue;

        const originalVal = (originalAsset as Record<string, unknown>)[key];
        const updatedVal = (updatedAsset as Record<string, unknown>)[key];

        if (originalVal !== updatedVal) {
          oldData[key] = originalVal === undefined ? null : originalVal;
          newData[key] = updatedVal === undefined ? null : updatedVal;
          hasChanges = true;
        }
      }
    }

    if (!hasChanges) return { hasChanges: false };

    try {
      const details = `Edição do ativo Etiqueta: ${updatedAsset.ETIQUETA || 'Sem Plaqueta'}`;
      
      await localDb.auditLogs.add({
        timestamp: new Date().toISOString(),
        user: userEmail,
        user_email: userEmail,
        action: 'UPDATE',
        table_name: 'ativos',
        record_id: updatedAsset.id || updatedAsset.primarykey,
        details,
        old_data: oldData,
        new_data: newData,
        tenantId: updatedAsset.tenantId || updatedAsset._tenantid || 'CICOPAL'
      });

      logger.info(`>>> [Audit Engine] Delta gerado com sucesso para o ativo ${updatedAsset.id || updatedAsset.primarykey}`);
      return { hasChanges: true };
    } catch (error) {
      logger.error(">>> [Audit Error] Falha ao registrar trilha de auditoria local:", error);
      throw new Error("Bloqueio de segurança: Não é permitido salvar alterações sem trilha de auditoria.");
    }
  }
};

export default auditService;

