
import { localDb } from './localDbService';
import { Asset, AuditLogEntry, TagInventario, ConservationState } from '../types';
import { logger } from '../utils/logger';

export const stressTestService = {
  /**
   * Popula o banco de dados com uma grande quantidade de dados para teste de estresse.
   */
  async populateData(assetCount: number = 5000, logCount: number = 1000) {
    logger.info(`>>> [STRESS TEST] Iniciando população de dados: ${assetCount} ativos, ${logCount} logs...`);
    
    // 1. Gerar Ativos
    const assets: Asset[] = [];
    for (let i = 0; i < assetCount; i++) {
      assets.push({
        id: `STRESS_${i}`,
        etiqueta: `ETQ_${i.toString().padStart(6, '0')}`,
        descricaodoativo: `ITEM DE TESTE DE ESTRESSE - REGISTRO ${i}`,
        vlraquisic: Math.random() * 10000,
        tenantid: 'STRESS_TEST_TENANT',
        filial: 'STRESS_UNIT',
        TAG_INVENTARIO: TagInventario.PENDENTE,
        ESTADO_CONSERVACAO: ConservationState.BOM,
        _conferido: false
      } as unknown as Asset);
      
      // Bulk add a cada 200 para não estourar memória
      if (assets.length >= 200) {
        await localDb.assets.bulkAdd(assets);
        assets.length = 0;
      }
    }
    if (assets.length > 0) await localDb.assets.bulkAdd(assets);

    // 2. Gerar Logs
    const logs: AuditLogEntry[] = [];
    for (let i = 0; i < logCount; i++) {
      logs.push({
        timestamp: new Date().toISOString(),
        user: 'stress_tester@gbr.com',
        user_email: 'stress_tester@gbr.com',
        action: 'STRESS_ACTION',
        details: `Log de teste de estresse número ${i}`,
        tenantid: 'STRESS_TEST_TENANT'
      });

      if (logs.length >= 500) {
        await localDb.auditLogs.bulkAdd(logs);
        logs.length = 0;
      }
    }
    if (logs.length > 0) await localDb.auditLogs.bulkAdd(logs);

    // 3. Popular LocalStorage
    localStorage.setItem('STRESS_TEST_KEY_TO_CLEAN', 'This should be gone');
    localStorage.setItem('inventory_assets_v24_internal_secure_STRESS', 'This should stay');

    logger.info('>>> [STRESS TEST] População concluída.');
    return { assetCount, logCount };
  },

  /**
   * Verifica o estado atual do banco.
   */
  async getStats() {
    const assetCount = await localDb.assets.count();
    const logCount = await localDb.auditLogs.count();
    const configCount = await localDb.unitConfigs.count();
    
    const localStorageKeys = Object.keys(localStorage);
    const stressKeys = localStorageKeys.filter(k => k.includes('STRESS'));

    return {
      assetCount,
      logCount,
      configCount,
      stressKeys
    };
  }
};
