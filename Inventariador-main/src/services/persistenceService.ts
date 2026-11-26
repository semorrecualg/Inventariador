import { Capacitor } from '@capacitor/core';
import localforage from 'localforage';
import { Asset, InventoryState, DatabaseStatus, DatabaseMode } from '../types';
import { syncAssetsToCloudAndMark, syncConfigToCloud } from './supabaseService';
import { encryption } from './securityService';
import { localDb, backupDatabaseToPhysicalStorage } from './localDbService';
import { sqliteService, db, DexieAsset, invalidateTenantCaseMarker } from './sqliteService';
import { generateChecksum } from './utils';
import { recordPerf, scheduleIdle, startPerf } from '../utils/perfMetrics';
import { normalizeAssetContract } from '../utils/schema';
import { FileSystemStorageService } from './FileSystemStorageService';
import { logger } from '../utils/logger';
import { sanitizeAssetKey } from '../utils/assetKey';
import { readLocalTenantId, readSessionTenantId } from '../utils/tenantUtils';
import { marcarAlteracaoLocal } from '../utils/pendencia';
import { marcarConferido } from '../utils/conferencia';
import { reportRecnoConflictForAsset } from './recnoGuardService';
import { entradaOutbox } from './syncOutbox';
import type { RecnoCandidate } from '../utils/recnoGuard';

// Chaves base para o armazenamento
const BASE_ASSETS_KEY = 'inventory_assets_v24';
const BASE_CONFIG_KEY = 'inventory_config_v24';

/**
 * Retorna as chaves de armazenamento específicas para o modo de banco de dados
 */
const getInventoryKeys = (mode: DatabaseMode) => {
  const suffix = mode.startsWith('SUPABASE') ? '_supabase' : '_internal';
  return {
    assets: `${BASE_ASSETS_KEY}${suffix}_secure`,
    config: `${BASE_CONFIG_KEY}${suffix}_secure`
  };
};

/**
 * §A.5 — o Dexie é o cache; o blob cifrado é a via de recuo.
 * ============================================================================
 * `saveInventory` gravava o inventário inteiro duas vezes: cifrado no
 * localforage e nas tabelas do Dexie. A cópia cifrada custa o `encrypt` da base
 * toda e duplica o espaço — e ninguém a lia enquanto o Dexie tivesse linhas.
 * Passa a ser escrita só quando é a única cópia: falha do Dexie, espelho legado
 * pedido por chave, ou um save que não escreve ativos no cache com o cache
 * ainda vazio.
 *
 * As chaves de ambiente são lidas a cada chamada (nunca no import), para um
 * aparelho poder recuar sem nova release — o que a agenda chama «release de
 * fallback»:
 *   - `gbr_read_from_dexie_first=0` volta a ler o blob cifrado primeiro no modo
 *     oficial (a paridade com a versão antiga exige o espelho ligado);
 *   - `gbr_legacy_assets_mirror=1` volta a gravar o blob a cada save.
 */
export const READ_FROM_DEXIE_FIRST_KEY = 'gbr_read_from_dexie_first';
export const LEGACY_ASSETS_MIRROR_KEY = 'gbr_legacy_assets_mirror';

const lerChaveBooleana = (chave: string, porOmissao: boolean): boolean => {
  if (typeof localStorage === 'undefined') return porOmissao;
  try {
    const bruto = localStorage.getItem(chave);
    if (bruto === null) return porOmissao;
    return bruto !== '0' && bruto.trim().toLowerCase() !== 'false';
  } catch {
    return porOmissao;
  }
};

export type PersistenceFlags = {
  /** Ler o cache Dexie antes do blob cifrado (padrão no modo oficial). */
  readFromDexieFirst: boolean;
  /** Voltar a gravar o blob cifrado a cada save (coexistência/rollback). */
  legacyAssetsMirror: boolean;
};

export const getPersistenceFlags = (): PersistenceFlags => ({
  readFromDexieFirst: lerChaveBooleana(READ_FROM_DEXIE_FIRST_KEY, true),
  legacyAssetsMirror: lerChaveBooleana(LEGACY_ASSETS_MIRROR_KEY, false)
});

/** Linhas vivas do cache Dexie — a fonte de leitura a partir da A.5. */
const lerAtivosDoCacheDexie = async (): Promise<Asset[]> => {
  try {
    return ((await sqliteService.getAllAssets()) as unknown as Asset[]) || [];
  } catch (err) {
    logger.warn('>>> [Persistence] Cache Dexie indisponível para leitura:', err);
    return [];
  }
};

/**
 * Escopa o cache ao contrato da sessão. Sem contrato identificado devolve vazio:
 * numa base oficial o cache guarda linhas de vários contratos e o arranque não
 * pode mostrar as de outro.
 */
const escoparPorContratoDaSessao = (assets: Asset[]): Asset[] => {
  const tenant = (readSessionTenantId() || readLocalTenantId() || '').trim().toUpperCase();
  if (!tenant) return [];
  return assets.filter(a => String(a.tenantid ?? '').trim().toUpperCase() === tenant);
};

/** Blob cifrado legado: `null` quando não existe (distinto de «existe e vazio»). */
const lerAtivosDoBlobCifrado = async (chave: string): Promise<Asset[] | null> => {
  const guardado = await localforage.getItem<Uint8Array | string>(chave);
  if (!guardado) return null;
  return ((await encryption.decrypt(guardado)) as Asset[]) || [];
};

// Configure localforage
localforage.config({
  name: 'GBR_Inventory_App',
  storeName: 'inventory_store'
});

/**
 * Gera um backup do inventário atual em formato JSON e inicia o download
 */
export const backupInventory = async (mode: DatabaseMode, customName?: string): Promise<boolean> => {
  try {
    const keys = getInventoryKeys(mode);
    const encryptedConfig = await localforage.getItem<Uint8Array | string>(keys.config);

    // §A.5: o cache Dexie é a fonte. O blob cifrado é o recuo das instalações
    // antigas (e dos aparelhos onde a escrita no Dexie falhou).
    let assets: Asset[] = await lerAtivosDoCacheDexie();
    if (assets.length === 0) {
      try {
        assets = (await lerAtivosDoBlobCifrado(keys.assets)) || [];
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'DECRYPTION_FAILED') {
          logger.error('Não é possível gerar backup: Dados locais corrompidos ou chave inválida.');
          return false;
        }
        throw error;
      }
    }

    if (assets.length === 0 && !encryptedConfig) return false;

    let config: Record<string, unknown> = {};
    if (encryptedConfig) {
      try {
        config = await encryption.decrypt(encryptedConfig) as Record<string, unknown>;
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'DECRYPTION_FAILED') {
          logger.error('Não é possível gerar backup: Dados locais corrompidos ou chave inválida.');
          return false;
        }
        throw error;
      }
    }

    const backupData = {
      version: 'v24.50',
      mode: mode,
      timestamp: new Date().toISOString(),
      assets: assets || [],
      config: config || {}
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const suffix = mode === DatabaseMode.INTERNAL ? '.Mobile' : '.Cloud';
    const fileName = customName || `GBR_BACKUP_${new Date().getTime()}${suffix}`;
    link.download = `${fileName}.db`; // Usando .db como extensão padrão com o sufixo solicitado
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    logger.error('Erro ao gerar backup:', error);
    return false;
  }
};

/**
 * Restaura o inventário a partir de um arquivo JSON
 */
export const restoreInventory = async (file: File, mode: DatabaseMode): Promise<InventoryState | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        if (!data.assets || !Array.isArray(data.assets)) {
          throw new Error('Formato de backup inválido');
        }
        // Backup pode ter tenantid em qualquer casing: invalida a migração.
        await invalidateTenantCaseMarker();

        const newState: InventoryState = {
          ...(data.config || {}),
          assets: data.assets,
          lastUpdated: new Date().toISOString(),
          status: DatabaseStatus.LOADED,
          databaseMode: mode
        };

        const keys = getInventoryKeys(mode);

        // §A.5: o cache Dexie é a fonte de leitura — o restauro tem de gravar
        // lá, ou o arranque seguinte voltava à base antiga (que o cache ainda
        // tem) e a restauração desaparecia.
        try {
          await sqliteService.saveInventoryConfig((data.config || {}) as Record<string, unknown>);
          if (Array.isArray(data.assets) && data.assets.length > 0) {
            await sqliteService.bulkInsertAssets(data.assets);
          }
        } catch (dexieErr) {
          logger.warn('>>> [Persistence] Restauro não gravou no cache Dexie; fica o blob cifrado:', dexieErr);
        }

        // O blob cifrado mantém-se como cópia de recuo do restauro.
        const encryptedConfig = await encryption.encrypt(data.config || {});
        await localforage.setItem(keys.config, encryptedConfig);
        const encryptedAssets = await encryption.encrypt(data.assets);
        await localforage.setItem(keys.assets, encryptedAssets);

        resolve(newState);
      } catch (error) {
        logger.error('Erro ao restaurar backup:', error);
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
};

/**
 * Salva um único ativo de forma incremental no Dexie (SQLite-like)
 * Isso evita o congelamento da UI ao processar milhares de itens.
 */
/**
 * Salva apenas as configurações (metadata) para evitar processamento pesado de ativos.
 */
export const saveConfigOnly = async (data: Partial<InventoryState>): Promise<void> => {
  try {
    const mode = data.databaseMode || DatabaseMode.INTERNAL;
    const keys = getInventoryKeys(mode);
    const encryptedConfig = await encryption.encrypt(data);
    await localforage.setItem(keys.config, encryptedConfig);
    logger.info('>>> [Persistence] Configurações salvas (Fast Path).');
  } catch (error) {
    logger.error('Erro ao salvar configurações:', error);
  }
};

// --- Resguardo em localStorage coalescido (contingência por ativo) ---
// A versão anterior lia, fazia JSON.parse, filtrava, fazia push e JSON.stringify
// de TODO o array de contingência a cada conferência — com 7.000 ativos isso é
// um bloqueio da main thread de dezenas de ms por toque, a crescer linearmente.
// Aqui as alterações acumulam-se em memória e são fundidas numa única escrita.
const backupMirrorQueue = new Map<string, Map<string, Asset>>();
let backupMirrorTimer: ReturnType<typeof setTimeout> | null = null;
const BACKUP_MIRROR_DELAY_MS = 800;

const writeBackupBucket = (key: string, pending: Map<string, Asset>) => {
  try {
    const raw = localStorage.getItem(key);
    let arr: Asset[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed as Asset[];
      } catch {
        arr = [];
      }
    }
    const pendingIds = new Set(pending.keys());
    const merged = arr.filter(a => !pendingIds.has(String(a.id)));
    pending.forEach(a => merged.push(a));
    localStorage.setItem(key, JSON.stringify(merged));
  } catch (e) {
    logger.warn('>>> [Persistência Espelhada] Erro ao gravar backup de contingência no localStorage:', e);
  }
};

export const flushAssetBackupMirror = (): void => {
  if (backupMirrorTimer) {
    clearTimeout(backupMirrorTimer);
    backupMirrorTimer = null;
  }
  for (const [key, pending] of backupMirrorQueue) {
    if (pending.size === 0) continue;
    writeBackupBucket(key, pending);
  }
  backupMirrorQueue.clear();
};

export const queueAssetBackupMirror = (asset: Asset, tenantid: string, filial: string): void => {
  const key = `gbr_backup_${String(tenantid || '').trim().toUpperCase()}_${String(filial || 'MATRIZ').trim().toUpperCase()}`;
  const bucket = backupMirrorQueue.get(key) || new Map<string, Asset>();
  bucket.set(String(asset.id), asset);
  backupMirrorQueue.set(key, bucket);
  if (backupMirrorTimer) return;
  backupMirrorTimer = setTimeout(() => {
    backupMirrorTimer = null;
    flushAssetBackupMirror();
  }, BACKUP_MIRROR_DELAY_MS);
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAssetBackupMirror();
  });
}

/**
 * A CONTINGÊNCIA MORRE COM O REGISTO
 * ============================================================================
 * `queueAssetBackupMirror` (e `syncService.backupContingencyLocal`) guardam
 * cópias inteiras de ativos em `localStorage`, em `gbr_backup_<tenant>_<filial>`.
 * A cópia leva o `_syncFailAt` dentro e o arranque do Inventory relê-a e
 * reinsere o ativo («Recovery Boot»). Uma limpeza local que apagasse só o
 * inventário deixava o registo — e o carimbo — a ressuscitar no arranque
 * seguinte, a pintar outra vez o selo e a fila. Removido o ativo, o rascunho
 * dele (e a escrita coalescida ainda pendente) saem na mesma operação.
 */
const chaveContingencia = (asset: Asset): string => {
  const tenant = String(asset.tenantid ?? '').trim().toUpperCase();
  const filial = String(asset.filial ?? asset._unitid ?? 'MATRIZ').trim().toUpperCase() || 'MATRIZ';
  return `gbr_backup_${tenant}_${filial}`;
};

const removerChavesDeContingencia = (chaves: Iterable<string>): void => {
  if (typeof localStorage === 'undefined') return;
  for (const chave of chaves) {
    try {
      localStorage.removeItem(chave);
    } catch {
      /* modo privado/quota: nada a fazer, o inventário já saiu */
    }
  }
};

/** Descarta a contingência dos ativos removidos (e a escrita coalescida deles). */
const descartarContingenciaDosRemovidos = (removidos: Asset[]): void => {
  if (removidos.length === 0) return;
  const ids = new Set(removidos.map(a => String(a.id ?? a.primarykey ?? '')));
  for (const [chave, pendentes] of backupMirrorQueue) {
    ids.forEach(id => pendentes.delete(id));
    if (pendentes.size === 0) backupMirrorQueue.delete(chave);
  }
  removerChavesDeContingencia(new Set(removidos.map(chaveContingencia)));
};

/** Limpeza total: nenhum rascunho de contingência sobrevive ao inventário. */
const limparTodaContingencia = (): void => {
  backupMirrorQueue.clear();
  if (backupMirrorTimer) {
    clearTimeout(backupMirrorTimer);
    backupMirrorTimer = null;
  }
  if (typeof localStorage === 'undefined') return;
  const chaves: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (chave && chave.startsWith('gbr_backup_')) chaves.push(chave);
    }
  } catch {
    return;
  }
  removerChavesDeContingencia(chaves);
};

export const saveAssetIncremental = async (asset: Asset): Promise<void> => {
  try {
    await localDb.assets.put(asset);
    logger.info(`>>> [Persistence] Ativo ${asset.etiqueta} salvo incrementalmente.`);
  } catch (error) {
    logger.error('Erro no salvamento incremental:', error);
    // Re-throw to allow the caller to handle the "Healthy Pessimism" logic
    throw new Error(`Erro SQL no salvamento local: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export async function saveCollectedAssetAtomic(assetData: Partial<DexieAsset> & { primarykey: string }): Promise<void> {
  // Higienização dos indexadores principais conforme diretrizes de governança GBR
  // Chave canônica única (utils/assetKey): a mesma regra da carga da planilha,
  // do pull da nuvem e do envio. Antes esta função expurgava separadores a mais
  // e criava uma chave diferente da que a carga gravou para o mesmo ativo.
  if (assetData.primarykey) assetData.primarykey = sanitizeAssetKey(assetData.primarykey);
  if (assetData.etiqueta) assetData.etiqueta = sanitizeAssetKey(assetData.etiqueta);
  if (assetData.tag) assetData.tag = sanitizeAssetKey(assetData.tag);

  // Guarda o registo gravado: a verificação de recno corre FORA da transação
  // (a auditoria vive noutra tabela e não pode entrar neste escopo).
  let mergedData: DexieAsset | null = null;

  // Bloqueia e sequencia as tabelas envolvidas em modo Read-Write
  // A outbox entra no MESMO escopo: o ativo e a sua entrada de subida são
  // gravados ou falham juntos. É a razão de a fila viver em Dexie.
  await db.transaction('rw', [db.local_assets, db.ativos, db.sync_outbox], async () => {
    // Chave composta [tenantid+primarykey] — o tenantid é o muro entre contratos.
    const tenantKey = String(assetData.tenantid || '').trim().toUpperCase();
    const assetKey: [string, string] = [tenantKey, String(assetData.primarykey || '')];
    const existingActive = await db.ativos.get(assetKey);
    const existingLocal = await db.local_assets.get(assetKey);

    mergedData = {
      ...(existingActive || {}),
      ...(existingLocal || {}),
      ...assetData,
      tenantid: String(assetData.tenantid || existingLocal?.tenantid || existingActive?.tenantid || '').trim().toUpperCase(),
      ...marcarConferido(),
      ...marcarAlteracaoLocal(),
      updated_at: new Date().toISOString()
    } as unknown as DexieAsset;

    // Escrita atômica sequencial
    await db.local_assets.put(mergedData as DexieAsset);
    // Envelope de subida (v9): a conferência já entra na fila durável, com o
    // `_is_synced` que `marcarAlteracaoLocal` acabou de pôr a 0.
    await db.sync_outbox.put(entradaOutbox(mergedData as unknown as Record<string, unknown>));
    if (existingActive) {
      await db.ativos.update(assetKey, { ...marcarConferido() });
    }
  });

  // Guardião suave: recno repetido com etiqueta/descrição/valor diferentes vira
  // registro de auditoria (ASSET_DUP_SUSPECT). Não bloqueia a conferência.
  try {
    await reportRecnoConflictForAsset(mergedData as unknown as RecnoCandidate, 'CONFERENCIA');
  } catch (err: unknown) {
    logger.warn('[RECNO] Falha ao verificar duplicidade na conferência:', err instanceof Error ? err.message : String(err));
  }

  // Espelhamento físico em background no disco rígido do dispositivo (Anti-Limpeza).
  // Antes esta rotina lia a base INTEIRA (toArray) e regravava o JSON completo a
  // cada ativo conferido: 7.000 confirmações = 7.000 dumps de ~7.000 linhas.
  // Agora as gravações são coalescidas (uma por janela) e serializadas: o dump
  // reflete sempre o estado mais recente, sem multiplicar I/O por toque.
  schedulePhysicalMirror();
}

// --- Espelho físico coalescido (ver comentário em saveCollectedAssetAtomic) ---
let physicalMirrorTimer: ReturnType<typeof setTimeout> | null = null;
let physicalMirrorInFlight: Promise<void> | null = null;
let physicalMirrorDirty = false;
const PHYSICAL_MIRROR_DELAY_MS = 1200;

const runPhysicalMirror = async (): Promise<void> => {
  physicalMirrorDirty = false;
  // Na Web o Filesystem nativo não existe (os dois serviços retornam cedo):
  // ler a base inteira seria trabalho puro sem destino. Só corre no dispositivo.
  if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform()) return;
  try {
    const todosAtivos = await db.local_assets.toArray();
    // Executa conversões explícitas e higienização regex de ruídos antes de gravar no hardware físico
    const dadosHigienizados = todosAtivos.map(row => ({
      ...row,
      codigo_endereco: (row as unknown as Record<string, unknown>).codigo_endereco ? String((row as unknown as Record<string, unknown>).codigo_endereco).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') : ''
    }));
    await FileSystemStorageService.salvarEmDiretorioLocal(dadosHigienizados);
    await backupDatabaseToPhysicalStorage(dadosHigienizados);
  } catch (err) {
    logger.error('[SRE] Erro ao espelhar em diretorio local:', err);
  }
};

export const flushPhysicalMirror = async (): Promise<void> => {
  if (physicalMirrorTimer) {
    clearTimeout(physicalMirrorTimer);
    physicalMirrorTimer = null;
  }
  if (physicalMirrorInFlight) {
    await physicalMirrorInFlight.catch(() => undefined);
  }
  if (!physicalMirrorDirty) return;
  physicalMirrorInFlight = runPhysicalMirror();
  await physicalMirrorInFlight.catch(() => undefined);
  physicalMirrorInFlight = null;
};

const schedulePhysicalMirror = (): void => {
  physicalMirrorDirty = true;
  if (physicalMirrorTimer) return;
  physicalMirrorTimer = setTimeout(() => {
    physicalMirrorTimer = null;
    if (physicalMirrorInFlight) {
      // Já existe um dump a correr: reprograma para depois dele.
      schedulePhysicalMirror();
      return;
    }
    physicalMirrorInFlight = runPhysicalMirror();
    physicalMirrorInFlight.finally(() => {
      physicalMirrorInFlight = null;
      if (physicalMirrorDirty) schedulePhysicalMirror();
    });
  }, PHYSICAL_MIRROR_DELAY_MS);
};

// --- Checksum de integridade fora do caminho crítico (§A.4) ---
// O hash acompanha o último salvamento, mas é calculado **depois** de ele estar
// gravado: um SHA-256 sobre a base inteira dentro do `saveInventory` atrasava o
// save sem que ninguém esperasse pelo resultado. A chave é separada da config
// cifrada para não obrigar a recifrá-la só para guardar 64 caracteres.
const integrityKey = (keys: ReturnType<typeof getInventoryKeys>): string => `${keys.config}_integrity`;

let integrityGeneration = 0;
let integrityInFlight: Promise<void> | null = null;

const scheduleIntegrityFingerprint = (
  keys: ReturnType<typeof getInventoryKeys>,
  assets: Asset[]
): void => {
  const generation = ++integrityGeneration;
  // Cópia rasa: o hash cobre o conjunto entregue a este save, mesmo que a UI
  // altere/substitua o array antes de a thread ficar ociosa.
  const snapshot = assets.slice();
  const storageKey = integrityKey(keys);
  integrityInFlight = new Promise<void>((resolve) => {
    scheduleIdle(() => {
      void generateChecksum(snapshot)
        .then(async (hash) => {
          // Um save posterior já mandou: o hash antigo não pode ocupar o lugar
          // do mais recente.
          if (generation !== integrityGeneration) return;
          await localforage.setItem(storageKey, hash);
        })
        .catch((err) => {
          logger.warn('>>> [Integrity] Falha ao gravar o checksum pós-save:', err);
        })
        .finally(resolve);
    });
  });
};

/** Espera pelo checksum agendado — usado nos testes e antes de encerrar. */
export const flushIntegrityFingerprint = async (): Promise<void> => {
  if (integrityInFlight) await integrityInFlight;
};

export type InventoryIntegrityVerdict =
  | { status: 'confere'; hash: string; total: number }
  | { status: 'divergente'; gravado: string; atual: string; total: number }
  | { status: 'sem-registo'; total: number }
  | { status: 'erro'; total: number };

/**
 * Veredicto de integridade **sob pedido**: compara o hash do último save com o
 * conjunto atual. Corre no diagnóstico, nunca no arranque.
 */
export const checkInventoryIntegrity = async (
  mode: DatabaseMode,
  assets: Asset[]
): Promise<InventoryIntegrityVerdict> => {
  const total = assets.length;
  const gravado = await localforage.getItem<string>(integrityKey(getInventoryKeys(mode)));
  if (typeof gravado !== 'string' || gravado.length === 0) return { status: 'sem-registo', total };
  const atual = await generateChecksum(assets);
  if (atual === 'checksum_error') return { status: 'erro', total };
  return atual === gravado
    ? { status: 'confere', hash: atual, total }
    : { status: 'divergente', gravado, atual, total };
};

export const saveInventory = async (data: InventoryState, dirtyAssets?: Asset[], forceCloudSync = false, skipSqlAssetsInsert = false): Promise<void> => {
  // §8 do plano de sincronização: o tempo deste save, com o tamanho do
  // inventário no `count` — é o que torna medíveis «1 ativo» e «300 ativos».
  // A amostra é gravada mesmo quando o save falha (é o `finally`).
  const startedAt = startPerf();
  try {
    const mode = data.databaseMode || DatabaseMode.INTERNAL;
    const keys = getInventoryKeys(mode);
    
    logger.info(`>>> [Persistence] Iniciando salvamento do inventário (Modo: ${mode}, skipSqlAssetsInsert: ${skipSqlAssetsInsert})...`);
    
    // 1. Salva localmente primeiro (Offline-First)
    const config = { ...data } as Record<string, unknown>;
    const assets = data.assets;
    
    // Remove campos de estado da UI e assets para o hash da config
    delete config.assets;
    delete config._integrity_failed;
    delete config._integrity_hash;

    // 1.1 Persistência Global em SQLite (Soberania de Dados) / Injeção para o Jeep-SQLite
    // Sincroniza e insere no SQLite físico independente de modo (seja INTERNAL ou SUPABASE na nuvem)
    logger.info('>>> [Persistence] Gravando metadados e configuração no SQLite físico...');
    await sqliteService.saveInventoryConfig(config);
    
    // CRITICAL: Se houver ativos sujos (dirtyAssets) ou se for um salvamento completo (sem dirtyAssets especificados),
    // persistimos os ativos na tabela SQL física de alta performance.
    // §A.5: esta é a escrita canônica dos ativos — o cache Dexie é a única
    // cópia de trabalho do inventário. O espelho em lotes que vinha a seguir
    // regravava `local_assets` com as mesmas linhas (escrita dupla no Dexie).
    const assetsToSave = dirtyAssets || assets;
    let falhouNoDexie = false;
    if (assetsToSave.length > 0 && !skipSqlAssetsInsert) {
      logger.info(`>>> [Persistence] Inserindo ${assetsToSave.length} ativos no cache Dexie...`);
      try {
        await sqliteService.bulkInsertAssets(assetsToSave);
      } catch (dexieErr) {
        falhouNoDexie = true;
        logger.warn('>>> [Persistence] Falha ao gravar no cache Dexie: acionando o blob cifrado:', dexieErr);
      }
    }
    
    // Atualiza o status interno do banco físico para ACTIVE se houver ativos no banco
    const assetCount = await sqliteService.getAssetCount();
    if (assetCount > 0) {
      await sqliteService.setSystemStatus(DatabaseStatus.ACTIVE);
    }

    const flags = getPersistenceFlags();
    const gravouAtivosNoCache = !skipSqlAssetsInsert && assetsToSave.length > 0 && !falhouNoDexie;
    // O blob cifrado só entra quando é a única cópia: a escrita no Dexie falhou,
    // o espelho legado foi pedido por chave, ou este save não escreve ativos no
    // cache e o cache ainda está vazio (nos pulls o download grava-o antes).
    let precisaBlobCifrado = falhouNoDexie || flags.legacyAssetsMirror;
    if (!precisaBlobCifrado && !gravouAtivosNoCache && assets.length > 0) {
      precisaBlobCifrado = assetCount === 0;
    }

    logger.info('>>> [Persistence] Criptografando e gravando a configuração no cache IndexedDB...');
    const encryptedConfig = await encryption.encrypt(config);
    await localforage.setItem(keys.config, encryptedConfig);

    if (precisaBlobCifrado) {
      try {
        const encryptedAssets = await encryption.encrypt(assets);
        await localforage.setItem(keys.assets, encryptedAssets);
        const motivo = falhouNoDexie
          ? 'Dexie falhou'
          : flags.legacyAssetsMirror
            ? 'espelho legado ligado'
            : 'cache vazio';
        logger.warn(`>>> [Persistence] Blob cifrado gravado como recuo (${motivo}).`);
      } catch (blobErr) {
        // Sem o Dexie e sem o blob não ficou nada gravado: o erro é real.
        if (falhouNoDexie) throw blobErr;
        logger.warn('>>> [Persistence] Falha ao gravar o espelho cifrado:', blobErr);
      }
    }

    // §A.4: o checksum entra depois da gravação, em ocioso. O save deixa de
    // pagar o SHA-256 sobre a base inteira; quem precisa do veredicto pede-o
    // ao diagnóstico (`checkInventoryIntegrity`).
    scheduleIntegrityFingerprint(keys, assets);

    logger.info('>>> [Persistence] Gravado com sucesso no IndexedDB.');

    // 2. Tenta sincronizar com a nuvem (Supabase) - Apenas se estiver em modo SUPABASE
    if (mode.startsWith('SUPABASE')) {
      const assetsToSync = dirtyAssets || [];
      // O autosave não conhece o perfil: o contrato vem da sessão. Sem ele a
      // configuração não tem como ser isolada — e o serviço agora ignora o
      // envio em vez de encerrar a sessão por causa de um save em segundo plano.
      const tenantForSync = (readSessionTenantId() || readLocalTenantId() || '').trim() || undefined;

      if (assetsToSync.length > 0) {
        logger.info(`>>> [Persistence] Sincronizando ${assetsToSync.length} ativos sujos com a nuvem...`);
        // syncAssetsToCloudAndMark: marca _is_synced = 1 nos ids aceites, para a
        // etiqueta "PENDENTE NUVEM" desaparecer sem depender de novo download.
        syncAssetsToCloudAndMark(assetsToSync).catch(err => logger.warn('Cloud sync failed (offline?):', err));
        // Se sincronizou ativos, sincroniza a config também para atualizar o lastUpdated na nuvem
        syncConfigToCloud(config as unknown as Omit<InventoryState, 'assets'>, tenantForSync).catch(err => logger.warn('Config sync failed (offline?):', err));
      } else if (forceCloudSync) {
        logger.info('>>> [Persistence] Sincronizando configurações com a nuvem (forced)...');
        syncConfigToCloud(config as unknown as Omit<InventoryState, 'assets'>, tenantForSync).catch(err => logger.warn('Config sync failed (offline?):', err));
      }
    }

  } catch (error) {
    logger.error('>>> [Persistence] Erro ao salvar inventário no IndexedDB:', error);
    throw error;
  } finally {
    recordPerf('save', startedAt, { count: data.assets?.length ?? 0 });
  }
};

/**
 * Failsafe de decifra: sem chave válida não há como ler nada — os caches locais
 * saem e a aplicação recarrega para re-sincronizar (comportamento herdado).
 */
const descartarCachesIlegiveis = async (tipo: 'config' | 'ativos'): Promise<null> => {
  logger.error(`>>> [Criptografia/Failsafe] Chave inválida ou dados corrompidos na decriptografia de ${tipo}. Limpando cache e forçando re-sync...`);
  try {
    localStorage.clear();
    sessionStorage.clear();
    await localforage.clear();
  } catch (clearErr) {
    logger.error('Erro ao limpar localforage/storages:', clearErr);
  }
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
  return null;
};

export const loadInventory = async (mode: DatabaseMode): Promise<InventoryState | null> => {
  try {
    const keys = getInventoryKeys(mode);
    const flags = getPersistenceFlags();

    // PRIORIDADE 0: o cache Dexie. No modo interno a base do aparelho é a
    // verdade; no modo oficial o mesmo cache serve a sessão, escopado ao
    // contrato — é a inversão de prioridade da A.5: o blob cifrado deixa de ser
    // o primeiro a ser lido.
    let cacheAssets: Asset[] = [];
    let sqlConfig: Partial<InventoryState> | null = null;

    if (mode === DatabaseMode.INTERNAL) {
      try {
        logger.info('>>> [Persistence] Tentando carregar dados do cache Dexie...');
        
        // Antes de carregar, verificamos o status do arquivo
        const fileStatus = await sqliteService.getFileStatus();
        
        // Se o arquivo estiver bloqueado ou aguardando permissão, verificamos se o service está inicializado (via cache)
        const isAcessivel = fileStatus.status === 'linked' || fileStatus.status === 'granted';
        const isInitialized = sqliteService.getIsInitialized();
        
        if (!isAcessivel && !isInitialized && (fileStatus.status === 'permission_denied' || fileStatus.status === 'expired')) {
          logger.warn(`>>> [Persistence] SOBERANIA: Arquivo físico bloqueado (${fileStatus.status}) e sem cache inicializado. Impedindo carga.`);
          return {
            assets: [],
            companies: [],
            databaseMode: mode,
            status: DatabaseStatus.ERROR,
            _integrity_failed: false 
          } as unknown as InventoryState;
        }

        // Buscamos ativos e config em paralelo do cache (pode ser o físico do
        // aparelho ou o cache do Service)
        const [assets, config] = await Promise.all([
          sqliteService.getAllAssets(),
          sqliteService.getInventoryConfig()
        ]);
        
        cacheAssets = assets as unknown as Asset[] || [];
        sqlConfig = config as Partial<InventoryState>;
        
        if (cacheAssets.length > 0) {
          logger.info(`>>> [Persistence] SUCESSO: ${cacheAssets.length} ativos carregados do ${sqliteService.getStorageSource() === 'CACHE' ? 'Cache (Fallback)' : 'SQLite físico'}.`);
        } else {
          logger.warn('>>> [Persistence] Cache Dexie vazio ou sem ativos.');
        }
      } catch (sqlErr) {
        logger.error('>>> [Persistence] Erro crítico ao ler o cache Dexie:', sqlErr);
      }
    } else if (flags.readFromDexieFirst) {
      // §A.5: no modo oficial a prioridade inverte-se também — o cache serve a
      // sessão, escopado ao contrato para não mostrar linhas de outro.
      const cacheDoContrato = escoparPorContratoDaSessao(await lerAtivosDoCacheDexie());
      if (cacheDoContrato.length > 0) {
        cacheAssets = cacheDoContrato;
        logger.info(`>>> [Persistence] ${cacheAssets.length} ativos carregados do cache Dexie (contrato da sessão).`);
      }
    }

    // Recuo das versões anteriores (e dos aparelhos onde o Dexie falhou): o
    // blob cifrado. Só é lido quando o cache não tem nada — ler uma base
    // inteira para a deitar fora era o custo do arranque antigo.
    const encryptedConfig = await localforage.getItem<Uint8Array | string>(keys.config);

    let ativosLegados: Asset[] | null = null;
    let legadoLido = false;
    const lerAtivosLegados = async (): Promise<Asset[] | null> => {
      if (!legadoLido) {
        ativosLegados = await lerAtivosDoBlobCifrado(keys.assets);
        legadoLido = true;
      }
      return ativosLegados;
    };

    if (!encryptedConfig && cacheAssets.length === 0) {
      try {
        if ((await lerAtivosLegados()) === null) return null;
      } catch (err) {
        logger.warn('>>> [Persistence] Falha ao decriptografar ativos do cache:', err);
        return await descartarCachesIlegiveis('ativos');
      }
    }

    // Decriptografamos as configurações
    let config: Record<string, unknown> = sqlConfig || {};
    
    // Se não veio do cache, tenta o blob cifrado
    if (Object.keys(config).length === 0 && encryptedConfig) {
      try {
        config = await encryption.decrypt(encryptedConfig) as Record<string, unknown>;
        logger.info('>>> [Persistence] Configuração carregada do cache IndexedDB.');
      } catch (err) {
        logger.warn('>>> [Persistence] Falha ao decriptografar config do cache:', err);
        return await descartarCachesIlegiveis('config');
      }
    }

    // §A.5: o cache Dexie é a fonte; o blob cifrado é só o recuo.
    let finalAssets = cacheAssets;
    
    if (finalAssets.length === 0) {
      try {
        finalAssets = (await lerAtivosLegados()) ?? [];
        if (finalAssets.length > 0) {
          logger.info(`>>> [Persistence] ${finalAssets.length} ativos carregados do cache IndexedDB (Fallback).`);
        }
      } catch (err) {
        logger.warn('>>> [Persistence] Falha ao decriptografar ativos do cache:', err);
        return await descartarCachesIlegiveis('ativos');
      }
    }

    // Normaliza os ativos de acordo com o contrato global unificado v2.6 (tenantid e filial)
    const normalizedAssets = finalAssets.map(a => normalizeAssetContract(a));

    // §A.4: a integridade deixou de ser recalculada no arranque. Re-hashear a
    // base inteira a cada carga só produzia um `logger.warn`; o veredicto é
    // agora pedido ao diagnóstico (`checkInventoryIntegrity`).

    // SEGURANÇA: Garante que a lista de empresas está populada se houver ativos mas a lista no cache estiver vazia
    if (normalizedAssets.length > 0) {
      const currentConfig = config as Record<string, unknown>;
      const currentCompanies = currentConfig.companies as string[] || [];
      if (currentCompanies.length === 0) {
        logger.info('>>> [Persistence] Auto-populando lista de empresas a partir dos ativos normalizados...');
        const extracted = [...new Set(normalizedAssets.map(a => a.filial))].filter(Boolean);
        currentConfig.companies = extracted;
      }
    }

    return {
      ...(config as Record<string, unknown> || {}),
      assets: normalizedAssets,
      databaseMode: mode
    } as InventoryState;
  } catch (error) {
    logger.error('Error loading inventory:', error);
    return null;
  }
};

export const clearMultipleInventories = async (companiesToClear: string[], mode: DatabaseMode): Promise<void> => {
  try {
    if (companiesToClear.length === 0) return;
    
    const keys = getInventoryKeys(mode);
    const blobGuardado = await localforage.getItem<Uint8Array | string>(keys.assets);

    // §A.5: o save já não escreve o blob — a fonte é o cache Dexie. O blob é o
    // recuo das instalações antigas e, quando existe, é reescrito como antes.
    let assets: Asset[] = await lerAtivosDoCacheDexie();
    if (assets.length === 0 && blobGuardado) {
      try {
        assets = await encryption.decrypt(blobGuardado) as Asset[] || [];
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'DECRYPTION_FAILED') {
          logger.warn('Falha ao decriptografar para limpeza múltipla. Limpando tudo...');
          await sqliteService.deleteLocalAssetsByUnits(companiesToClear);
          await localforage.removeItem(keys.assets);
          return;
        }
        throw error;
      }
    }
    const normalizedCompanies = companiesToClear.map(c => c.toUpperCase().trim());
    const pertenceAsUnidades = (a: Asset) =>
      normalizedCompanies.includes((a.filial || a._unitid || '').toUpperCase().trim());
    
    const remainingAssets = assets.filter(a => !pertenceAsUnidades(a));
    const removedAssets = assets.filter(pertenceAsUnidades);

    // O espelho Dexie e a contingência seguem a mesma remoção: sem isto, as
    // linhas limpas (e o `_syncFailAt` delas) ficavam vivas no selo e na fila.
    await sqliteService.deleteLocalAssetsByUnits(companiesToClear);
    descartarContingenciaDosRemovidos(removedAssets);
    
    if (blobGuardado) {
      const encryptedRemaining = await encryption.encrypt(remainingAssets);
      await localforage.setItem(keys.assets, encryptedRemaining);
    }
  } catch (error) {
    logger.error('Error clearing multiple inventories from IndexedDB:', error);
    throw error;
  }
};

export const clearInventory = async (mode: DatabaseMode, companyToClear?: string): Promise<void> => {
  try {
    const keys = getInventoryKeys(mode);
    if (companyToClear) {
      const blobGuardado = await localforage.getItem<Uint8Array | string>(keys.assets);

      // §A.5: mesma regra da limpeza múltipla — cache Dexie primeiro, blob como
      // recuo (e reescrito só quando existe).
      let assets: Asset[] = await lerAtivosDoCacheDexie();
      if (assets.length === 0 && blobGuardado) {
        try {
          assets = await encryption.decrypt(blobGuardado) as Asset[] || [];
        } catch (error: unknown) {
          if (error instanceof Error && error.message === 'DECRYPTION_FAILED') {
            logger.warn('Falha ao decriptografar para limpeza parcial. Limpando tudo...');
            await sqliteService.deleteLocalAssetsByUnits([companyToClear]);
            await localforage.removeItem(keys.assets);
            return;
          }
          throw error;
        }
      }
      const normalizedCompany = companyToClear.toUpperCase().trim();
      const pertenceAUnidade = (a: Asset) => (a.filial || a._unitid || '').toUpperCase().trim() === normalizedCompany;
      const remainingAssets = assets.filter(a => !pertenceAUnidade(a));
      const removedAssets = assets.filter(pertenceAUnidade);

      // A linha sai inteira dos espelhos (o carimbo morre com ela) e o rascunho
      // de contingência da unidade sai junto; os outros ativos não são tocados.
      await sqliteService.deleteLocalAssetsByUnits([companyToClear]);
      descartarContingenciaDosRemovidos(removedAssets);
      
      if (blobGuardado) {
        const encryptedRemaining = await encryption.encrypt(remainingAssets);
        await localforage.setItem(keys.assets, encryptedRemaining);
      }
    } else {
      await Promise.all([
        localforage.removeItem(keys.assets),
        localforage.removeItem(keys.config)
      ]);
      // GBR v25: Limpeza Total exige expurgo físico do SQLite — nos dois modos,
      // porque o inventário local inteiro saiu: as linhas (e os carimbos de
      // falha agarrados a elas) não podem sobreviver nos espelhos.
      await sqliteService.forcePurgeAndConnect();
      limparTodaContingencia();
    }
  } catch (error) {
    logger.error('Error clearing inventory from IndexedDB:', error);
    throw error;
  }
};
