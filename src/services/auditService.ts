import { sqliteService } from './sqliteService';
import { Asset } from '../types';

export const auditService = {
  /**
   * Compara o ativo original com o editado, calcula o delta e grava o log no SQLite (AUDIT_LOG)
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
      const logId = `LOG_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      // GBR v24.50: Usando o nome correto da tabela AUDIT_LOG e suas colunas correspondentes
      const query = `
        INSERT INTO AUDIT_LOG (
          id, usuario, acao, tabela, registro_id, 
          details, delta, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const details = `Edição do ativo Etiqueta: ${updatedAsset.ETIQUETA || 'Sem Plaqueta'}`;
      const deltaPayload = JSON.stringify({ old: oldData, new: newData });

      await sqliteService.execute(query, [
        logId,
        userEmail,
        'UPDATE',
        'ativos', // A tabela de ativos no SQLite é 'ativos'
        updatedAsset.id,
        details,
        deltaPayload,
        new Date().toISOString()
      ]);

      console.log(`>>> [Audit Engine] Delta gerado com sucesso para o ativo ${updatedAsset.id}`);
      return { hasChanges: true };
    } catch (error) {
      console.error(">>> [Audit Error] Falha ao registrar trilha de auditoria local:", error);
      throw new Error("Bloqueio de segurança: Não é permitido salvar alterações sem trilha de auditoria.");
    }
  }
};

export default auditService;
