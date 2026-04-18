
import { localDb } from './localDbService';
import { Asset, TagInventario } from '../types';

/**
 * Repositório de Ativos (Padrão Room/DAO para Web)
 * Fornece acesso de alta performance ao SQLite-like (IndexedDB via Dexie)
 */
export const assetRepository = {
  /**
   * Insere ou atualiza uma lista de ativos (Carga Inicial)
   */
  async bulkInsert(assets: Asset[]): Promise<void> {
    return await localDb.assets.bulkPut(assets);
  },

  /**
   * Busca um ativo pelo código de patrimônio (Busca Instantânea)
   */
  async findByEtiqueta(etiqueta: string): Promise<Asset | undefined> {
    const rawTerm = etiqueta.trim();
    const upperTerm = rawTerm.toUpperCase();
    
    // Tenta busca exata primeiro
    let asset = await localDb.assets.where('ETIQUETA').equals(upperTerm).first();
    
    // Se não encontrou e for numérico curto, tenta com padding de 6 zeros
    if (!asset && /^\d+$/.test(rawTerm) && rawTerm.length < 6) {
      const padded = rawTerm.padStart(6, '0');
      asset = await localDb.assets.where('ETIQUETA').equals(padded).first();
    }
    
    return asset || undefined;
  },

  /**
   * Atualiza o status de um ativo
   */
  async updateStatus(id: string, conferido: boolean, tag: TagInventario): Promise<void> {
    await localDb.assets.update(id, {
      _conferido: conferido,
      TAG_INVENTARIO: tag,
      _dataLeitura: new Date().toISOString()
    });
  },

  /**
   * Lista todos os ativos de uma unidade/localização
   */
  async listByLocation(location: string): Promise<Asset[]> {
    return await localDb.assets.where('_localMaster').equals(location).toArray();
  },

  /**
   * Lista todos os ativos (CUIDADO: Pode ser lento se houver muitos)
   */
  async getAll(): Promise<Asset[]> {
    return await localDb.assets.toArray();
  },

  /**
   * Importa ativos de um JSON (Carga de Dados)
   */
  async importJson(data: Asset[]): Promise<void> {
    const assets: Asset[] = data.map(item => ({
      ...item,
      id: item.id || crypto.randomUUID(),
      _conferido: !!item._conferido,
      _localMaster: item._localMaster || item.ENDERECO || ''
    }));
    await localDb.assets.bulkPut(assets);
  },

  /**
   * Importa ativos de um CSV (Carga de Dados)
   */
  async importCsv(csvContent: string): Promise<void> {
    // Implementação simplificada de parser CSV
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const assets: Asset[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = lines[i].split(',').map(v => v.trim());
      const asset: Partial<Asset> = { id: crypto.randomUUID() };
      headers.forEach((header, index) => {
        (asset as Record<string, unknown>)[header] = values[index];
      });
      assets.push(asset as Asset);
    }
    await localDb.assets.bulkPut(assets);
  },

  /**
   * Conta ativos por status em uma localização
   */
  async getStatsByLocation(location: string) {
    const assets = await this.listByLocation(location);
    const total = assets.length;
    const checked = assets.filter(a => a._conferido).length;
    return { total, checked, pending: total - checked };
  }
};
