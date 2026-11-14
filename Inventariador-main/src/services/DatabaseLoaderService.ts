import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import * as XLSX from 'xlsx';
import { db, DexieAsset, invalidateTenantCaseMarker } from './sqliteService';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { isAdminEmail } from '../utils/authUtils';
import { logger } from '../utils/logger';
import { normalizeFieldValue, normalizeDateISO, normalizeNumeric } from '../utils/normalize';
import { contentFingerprint, createFallbackKeyAllocator, resolveAssetKey, sanitizeAssetKey } from '../utils/assetKey';
import { reportRecnoCollisions } from './recnoGuardService';
import { resolveTenantKey } from '../utils/tenantSession';

export interface AtivoPlanilha {
  tag?: string | number;
  TAG?: string | number;
  etiqueta?: string | number;
  ETIQUETA?: string | number;
  vlraquisic?: string | number;
  VLRAQUISIC?: string | number;
  conta_contabil?: string;
  CONTA_CONTABIL?: string;
  contacontabil?: string;
  status?: string;
  STATUS?: string;
  databaixa?: string;
  DATABAIXA?: string;
  descricaodoativo?: string;
  DESCRICAODOATIVO?: string;
  descricao?: string;
  DESCRICAO?: string;
  item?: string;
  ITEM?: string;
  registro?: string;
  REGISTRO?: string;
  qt?: string | number;
  QT?: string | number;
  filial?: string;
  FILIAL?: string;
  endereco?: string;
  ENDERECO?: string;
  localizacao?: string;
  LOCALIZACAO?: string;
  [key: string]: string | number | boolean | null | undefined;
}

function getRowValue(row: Record<string, unknown>, ...keys: string[]): string | number | boolean | null | undefined {
  if (!row) return undefined;
  const rowKeys = Object.keys(row);
  for (const requestedKey of keys) {
    const reqClean = requestedKey.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const foundKey = rowKeys.find(k => {
      const kClean = k.toLowerCase().replace(/[^a-z0-9_]/g, '');
      return kClean === reqClean;
    });
    if (foundKey !== undefined) {
      return row[foundKey] as string | number | boolean | null | undefined;
    }
  }
  return undefined;
}

/**
 * CONTRATO SRE (planilha): nomes e ordem das colunas obrigatórias definidos pelo operador.
 * O tenantid (Índice 0) nunca recebe valor fixo/fallback — vem exclusivamente da planilha.
 */
/**
 * Espelha a coluna 'filial' exatamente como veio da planilha: sem trim, sem
 * uppercase, sem prefixo. Esse valor é a Unidade Operacional exibida na tela e
 * precisa ser idêntico ao que está na base do cliente.
 */
const mirrorFilial = (value: unknown): string => {
  const raw = value === null || value === undefined ? '' : String(value);
  const probe = raw.trim().toLowerCase();
  if (probe === '' || probe === 'null' || probe === 'undefined') return 'FILIAL_DEFAULT';
  return raw;
};

const CONTRACT_HEADERS = [
  'tenantid', 'filial', 'status', 'etiqueta', 'qt', 'descricaodoativo', 'serial',
  'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal', 'endereco', 'registro',
  'subreg', 'databaixa', 'contacontabil', 'primarykey', 'centrodecusto',
  'vlraquisic', 'sn1_recno', 'sn3_recno'
];

const CONTRACT_HEADERS_TEXT = CONTRACT_HEADERS.join(';');

function normalizeHeaderKey(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/**
 * CONTRATO SRE (planilha): valida o cabeçalho completo da planilha.
 * Bloqueia a carga se a coluna 'tenantid' (Índice 0) estiver AUSENTE, fora do
 * Índice 0 ou VAZIA em todas as linhas, ou se as 21 colunas obrigatórias não
 * estiverem presentes EXATAMENTE na ordem do contrato.
 */
function validateSpreadsheetContract(worksheet: XLSX.WorkSheet): void {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
  if (!aoa || aoa.length === 0) {
    throw new Error("A planilha fornecida está vazia ou corrompida.");
  }

  const header = (aoa[0] || []).map(normalizeHeaderKey);
  const tenantIdx = header.findIndex(h => h === 'tenantid');

  if (tenantIdx === -1) {
    const msg =
      "CARGA BLOQUEADA: a coluna 'tenantid' está AUSENTE na planilha. " +
      "Contrato obrigatório (a primeira coluna deve ser 'tenantid'): " +
      "tenantid;filial;status;etiqueta;qt;descricaodoativo;serial;dataaqusic;cnpj;nomefornecedor;notafiscal;endereco;registro;subreg;databaixa;contacontabil;primarykey;centrodecusto;vlraquisic;sn1_recno;sn3_recno";
    logger.error(`[SRE_LOADER] ${msg}`);
    throw new Error(msg);
  }

  if (tenantIdx !== 0) {
    const msg =
      `CARGA BLOQUEADA: a coluna 'tenantid' foi encontrada no Índice ${tenantIdx}, ` +
      "mas o contrato exige que seja o Índice 0 (primeira coluna) da planilha.";
    logger.error(`[SRE_LOADER] ${msg}`);
    throw new Error(msg);
  }

  // 2) Ordem exata das 21 colunas obrigatórias (Índices 0..20) — contrato rígido
  const orderMismatches: string[] = [];
  for (let i = 0; i < CONTRACT_HEADERS.length; i++) {
    const expected = CONTRACT_HEADERS[i];
    const found = header[i] !== undefined && header[i] !== '' ? header[i] : '(ausente)';
    if (header[i] !== expected) {
      orderMismatches.push(`Índice ${i}: esperado '${expected}', encontrado '${found}'`);
    }
  }
  if (orderMismatches.length > 0) {
    const msg =
      "CARGA BLOQUEADA: a ordem das colunas não segue o contrato. " +
      orderMismatches.join(' | ') +
      ` | Contrato obrigatório (ordem exata): ${CONTRACT_HEADERS_TEXT}`;
    logger.error(`[SRE_LOADER] ${msg}`);
    throw new Error(msg);
  }

  const hasTenantValue = aoa.slice(1).some(row => {
    const v = row[0];
    return v !== undefined && v !== null && String(v).trim() !== '';
  });

  if (!hasTenantValue) {
    const msg =
      "CARGA BLOQUEADA: a coluna 'tenantid' (Índice 0) está VAZIA em todas as linhas. " +
      "Preencha o tenantid de cada ativo na planilha antes de carregar.";
    logger.error(`[SRE_LOADER] ${msg}`);
    throw new Error(msg);
  }
}

export class DatabaseLoaderService {
  private BATCH_SIZE = 200;
  private static CHUNK_SIZE = 200; // Política SRE imperativa


  /**
   * Guardião suave de duplicidade por `tenantid + filial + sn1_recno`: roda no
   * fim da carga, compara etiqueta/descrição/valor e registra em `audit_logs` o
   * que divergir. Falha aqui NUNCA derruba a carga.
   */
  private static async reportRecnoAfterLoad(): Promise<void> {
    try {
      await reportRecnoCollisions('CARGA_PLANILHA');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[RECNO] Falha ao verificar duplicidade por recno após a carga:', message);
    }
  }

  static async extrairDadosDaPlanilha(file: Blob): Promise<unknown[]> {
    const reader = new FileReader();
    const dataBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      reader.onload = (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          resolve(e.target.result);
        } else {
          reject(new Error("Falha ao ler dados binários do arquivo."));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });

    const workbook = XLSX.read(dataBuffer, { type: "array" });
    const firstSheetName = workbook?.SheetNames?.[0];
    if (!firstSheetName) {
      throw new Error("Planilha inválida ou vazia.");
    }
    const worksheet = workbook.Sheets[firstSheetName];
    validateSpreadsheetContract(worksheet);
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet) as unknown[];
  }

  static async injetarDadosEmLotes(dadosBrutos: unknown[], onProgresso?: (porcentagem: number) => void): Promise<number> {
    // Carga nova pode reintroduzir tenantid não canónico: invalida o marcador.
    await invalidateTenantCaseMarker();
    let registrosProcessados = 0;
    // Chaves derivadas (linhas sem identidade) contam por carga inteira, não por lote.
    const allocateFallbackKey = createFallbackKeyAllocator();

    for (let i = 0; i < dadosBrutos.length; i += this.CHUNK_SIZE) {
      const loteBruto = dadosBrutos.slice(i, i + this.CHUNK_SIZE) as Record<string, unknown>[];
      
      const loteHigienizado: DexieAsset[] = loteBruto.map((row) => {
        // REGRA DE CONTRATO (planilha): o tenantid NUNCA recebe valor fixo. Vem da
        // coluna 'tenantid' (Índice 0); quando a linha não o traz, adopta o
        // contrato da sessão — gravar ['', primarykey] deixaria a linha órfã,
        // invisível para a contagem e fora do alcance da migração de case.
        const tenantid = resolveTenantKey(getRowValue(row, 'tenantid'));
        const rawFilial = mirrorFilial(row.filial);
        // Chave canônica única (utils/assetKey): primarykey → etiqueta → tag →
        // derivada do conteúdo. Antes esta carga olhava só `primarykey` e caía num
        // `ALT-<aleatório>`: cada importação criava linhas novas para o mesmo ativo.
        const pk = resolveAssetKey(
          { primarykey: row.primarykey, etiqueta: row.etiqueta, tag: row.tag },
          () => allocateFallbackKey(tenantid, rawFilial, contentFingerprint(row))
        );
        // Coluna canônica da planilha: 'endereco' (posição 11 do contrato). O nome 'codigo_endereco'
        // era lido antes e NÃO existe no contrato → gravava endereco: null para todos os ativos,
        // deixando o AddressSelector vazio. Fallbacks aceitos para tolerância de nomes de coluna.
        const codEnd = normalizeFieldValue('endereco', getRowValue(row, 'endereco', 'localizacao', 'localização', 'localidade', 'physicallocalization', 'loc', 'local', 'sala', 'posicao', 'posição', 'codigo_endereco'));
        const tagSanitizada = sanitizeAssetKey(row.tag) || sanitizeAssetKey(row.etiqueta) || pk;
        
        return {
          id: pk,
          primarykey: pk,
          tenantid: tenantid,
          // `filial` é a chave indexada (maiúscula, como as consultas esperam);
          // `filial_raw` guarda o texto exato da planilha para exibição.
          filial: rawFilial.toUpperCase(),
          filial_raw: rawFilial,
          status: normalizeFieldValue('status', getRowValue(row, 'status')) ?? 'Pendente',
          etiqueta: tagSanitizada,
          tag: tagSanitizada,
          qt: isNaN(Number(row.qt)) ? 1 : Number(row.qt),
          descricaodoativo: normalizeFieldValue('descricaodoativo', getRowValue(row, 'descricaodoativo', 'descricao', 'item')) ?? `Ativo N-${pk}`,
          serial: normalizeFieldValue('serial', row.serial),
          dataaqusic: normalizeDateISO(getRowValue(row, 'dataaqusic', 'dataaquisic')),
          cnpj: normalizeFieldValue('cnpj', row.cnpj),
          nomefornecedor: normalizeFieldValue('nomefornecedor', getRowValue(row, 'nomefornecedor', 'fornecedor')),
          notafiscal: normalizeFieldValue('notafiscal', row.notafiscal),
          endereco: codEnd || null,
          registro: normalizeFieldValue('registro', row.registro),
          subreg: normalizeFieldValue('subreg', row.subreg),
          databaixa: normalizeDateISO(getRowValue(row, 'databaixa')),
          contacontabil: normalizeFieldValue('contacontabil', row.contacontabil),
          centrodecusto: normalizeFieldValue('centrodecusto', row.centrodecusto),
          vlraquisic: isNaN(Number(row.vlraquisic)) ? 0 : Number(row.vlraquisic),
          sn1_recno: normalizeNumeric(row.sn1_recno),
          sn3_recno: normalizeNumeric(row.sn3_recno),
          _is_synced: 0,
          _is_deleted: 0,
          _conferido: 0,
          _plaquetado: 0,
          _aprovado: 0,
          _isNew: 0,
          _is_unitized: 0,
          _is_divergent_baixa: 0,
          _history: null,
          DE_PARA: null,
          _photoUrl: null,
          gps_lat: null,
          gps_lng: null
        };
      });

      // Transação ACID atômica por bloco para mitigar Race Conditions
      await db.transaction('rw', [db.ativos, db.assets, db.local_assets], async () => {
        await db.ativos.bulkPut(loteHigienizado);
        await db.assets.bulkPut(loteHigienizado);
        await db.local_assets.bulkPut(loteHigienizado);
      });

      registrosProcessados += loteHigienizado.length;
      if (onProgresso) {
        onProgresso(Math.round((registrosProcessados / dadosBrutos.length) * 100));
      }
      logger.info(`[SRE_LOADER] Lote injetado. Progresso: ${registrosProcessados}/${dadosBrutos.length}`);
    }
    await DatabaseLoaderService.reportRecnoAfterLoad();
    return registrosProcessados;
  }


  /**
   * Processa o arquivo físico do Excel (ou CSV/JSON), higieniza os dados e injeta no Dexie via lotes de 200.
   */
  public async processExcelFile(
    file: File,
    tenantid: string,
    unitId: string,
    onProgress: (batchIndex: number, insertedCount: number, totalInserted: number, finalPlanilhaTotal: number) => void
  ): Promise<number> {
    
    // 1. Validação Preventiva de Bateria Crítica (< 5% sem fonte externa) com bypass para operador homologado
    let currentBatteryLevel = 1.0;
    let isDeviceCharging = true;
    try {
      if (Capacitor.isNativePlatform()) {
        const info = await Device.getBatteryInfo();
        currentBatteryLevel = info.batteryLevel !== undefined ? info.batteryLevel : 1.0;
        isDeviceCharging = info.isCharging === true;
      } else {
        const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> };
        if (nav?.getBattery) {
          const battery = await nav.getBattery();
          currentBatteryLevel = battery?.level ?? 1.0;
          isDeviceCharging = battery?.charging ?? true;
        }
      }
    } catch (energyErr) {
      logger.warn(">>> [Hardware Check] Falha ao consultar subsistema de energia em DatabaseLoaderService:", energyErr);
    }

    const activeUserJson = typeof window !== 'undefined' ? sessionStorage?.getItem('app_current_user') : null;
    const activeUser = activeUserJson ? JSON.parse(activeUserJson) : null;
    const activeEmail = activeUser?.email || '';
    const emailValidoParaBypass = isAdminEmail(activeEmail);

    if (currentBatteryLevel < 0.05 && !isDeviceCharging) {
      if (emailValidoParaBypass) {
        logger.warn("⚡ [Soberania Admin] Bateria crítica (< 5%), porém OPERADOR HOMOLOGADO DETECTADO. Bypass síncrono ativado automaticamente.");
      } else {
        throw new Error("FAILSAFE: Operação abortada. Bateria abaixo de 5% sem fonte externa. Risco de corrupção do cabeçalho .db.");
      }
    }

    // 2. Leitura do arquivo binário e parser via biblioteca XLSX
    const dataBuffer = await this.fileToBuffer(file);
    const workbook = XLSX.read(dataBuffer, { type: "array" });
    const firstSheetName = workbook?.SheetNames?.[0];
    if (!firstSheetName) {
      throw new Error("Planilha inválida ou vazia.");
    }
    
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Converte a planilha em JSON tipado
    const rawRows = XLSX.utils.sheet_to_json<AtivoPlanilha>(worksheet);
    if (!rawRows || rawRows?.length === 0) {
      throw new Error("A planilha fornecida está vazia ou corrompida.");
    }
    validateSpreadsheetContract(worksheet);

    let totalInseridos = 0;
    let batchIndex = 0;

    // FASE 1 (SRE): Escrita silenciosa usando o handle global isolado (sem abrir popup)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirHandle = (window as any).globalSreDirectoryHandle;
      if (dirHandle) {
        const fileHandle = await dirHandle.getFileHandle(`PLANILHA_${unitId.toUpperCase()}.json`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(rawRows));
        await writable.close();
        logger.info(`>>> [SRE] Backup físico 100% Offline ancorado silenciosamente`);
      }
    } catch (ioErr) {
      logger.warn(">>> [SRE] Erro silencioso na ancoragem física:", ioErr);
    }

    try {
      // Processamento em lotes de 1000 (Chunking)
      const totalRows = rawRows.length;
      const allocateFallbackKey = createFallbackKeyAllocator();
      for (let i = 0; i < totalRows; i += this.BATCH_SIZE) {
        batchIndex++;
        const chunk = rawRows.slice(i, Math.min(i + this.BATCH_SIZE, totalRows));
        const assetsToInsert: DexieAsset[] = [];
        const correctionsToLog: { id: string; originalValue: unknown }[] = [];

        for (const row of chunk) {
          const finalFilialRaw = mirrorFilial(getRowValue(row, 'filial', 'unidade', 'unit', 'unitid', 'unit_id') || unitId);
          const finalFilial = finalFilialRaw.toUpperCase();
          const finalTenantid = resolveTenantKey(getRowValue(row, 'tenantid'));
          // Chave canônica única (utils/assetKey) — a mesma de todos os caminhos.
          const primarykeyVal = sanitizeAssetKey(getRowValue(row, 'primarykey'));
          const tagSanitizada = sanitizeAssetKey(getRowValue(row, 'etiqueta', 'tag'));
          const finalId = primarykeyVal || tagSanitizada
            || allocateFallbackKey(finalTenantid, finalFilial, contentFingerprint(row as Record<string, unknown>));
          const itemDesc = normalizeFieldValue(
            'descricaodoativo',
            getRowValue(row, 'descricaodoativo', 'descricao', 'item')
          ) ?? `Ativo N-${finalId}`;
          const finalRegistro = normalizeFieldValue('registro', getRowValue(row, 'registro') || `REG-${finalId}`);
          const finalQt = String(getRowValue(row, 'qt') !== undefined ? getRowValue(row, 'qt') : '1')?.trim();
          const contaContabil = normalizeFieldValue('contacontabil', getRowValue(row, 'contacontabil', 'conta_contabil') || 'SEM CONTA');
          const statusVal = normalizeFieldValue('status', getRowValue(row, 'status') || 'Pendente') ?? 'Pendente';

          const serialVal = normalizeFieldValue('serial', getRowValue(row, 'serial', 'serial_number'));
          const dataaqVal = normalizeDateISO(getRowValue(row, 'dataaqusic', 'dataaquisic'));
          const cnpjVal = normalizeFieldValue('cnpj', getRowValue(row, 'cnpj'));
          const fornecedorVal = normalizeFieldValue('nomefornecedor', getRowValue(row, 'nomefornecedor', 'fornecedor'));
          const nfVal = normalizeFieldValue('notafiscal', getRowValue(row, 'notafiscal'));
          const finalEndereco = normalizeFieldValue('endereco', getRowValue(row, 'endereco', 'end', 'localizacao', 'localização', 'localidade', 'physicallocalization', 'loc', 'local', 'sala', 'posicao', 'posição'));
          const subregVal = normalizeFieldValue('subreg', getRowValue(row, 'subreg'));
          const databaixaVal = normalizeDateISO(getRowValue(row, 'databaixa'));
          const centrodecustoVal = normalizeFieldValue('centrodecusto', getRowValue(row, 'centrodecusto', 'centro_custo'));
          const sn1RecnoRaw = getRowValue(row, 'sn1_recno');
          const sn3RecnoRaw = getRowValue(row, 'sn3_recno');
          const sn1RecnoVal = normalizeNumeric(sn1RecnoRaw);
          const sn3RecnoVal = normalizeNumeric(sn3RecnoRaw);

          // HIGIENIZAÇÃO CONTÁBIL EXIGIDA PELO LAUDO SRE: Higienização de Valor de Aquisição
          let vlrAquisicSanitizado = 0;
          let precisaLogarErro = false;
          const valorOriginalRaw = getRowValue(row, 'vlraquisic');

          if (valorOriginalRaw !== undefined && valorOriginalRaw !== null) {
            if (typeof valorOriginalRaw === 'number') {
              if (isNaN(valorOriginalRaw)) {
                vlrAquisicSanitizado = 0;
                precisaLogarErro = true;
              } else {
                vlrAquisicSanitizado = valorOriginalRaw;
              }
            } else {
              const cleanStr = String(valorOriginalRaw).replace(/[R$\s]/gi, '');
              if (cleanStr.includes(',') && cleanStr.includes('.')) {
                vlrAquisicSanitizado = parseFloat(cleanStr.replace(/\./g, '').replace(/,/g, '.'));
              } else if (cleanStr.includes(',')) {
                vlrAquisicSanitizado = parseFloat(cleanStr.replace(/,/g, '.'));
              } else {
                vlrAquisicSanitizado = parseFloat(cleanStr);
              }

              if (isNaN(vlrAquisicSanitizado)) {
                vlrAquisicSanitizado = 0;
                precisaLogarErro = true;
              }
            }
          }

          if (precisaLogarErro) {
            correctionsToLog.push({ id: finalId, originalValue: valorOriginalRaw });
          }

          const assetObj: DexieAsset = {
            id: finalId,
            tenantid: finalTenantid,
            filial: finalFilial,
            filial_raw: finalFilialRaw,
            status: statusVal,
            etiqueta: tagSanitizada,
            tag: tagSanitizada,
            qt: Number(finalQt || 1),
            descricaodoativo: itemDesc,
            serial: serialVal || null,
            dataaqusic: dataaqVal || null,
            cnpj: cnpjVal || null,
            nomefornecedor: fornecedorVal || null,
            notafiscal: nfVal || null,
            endereco: finalEndereco || null,
            registro: finalRegistro || null,
            subreg: subregVal || null,
            databaixa: databaixaVal || null,
            contacontabil: contaContabil || null,
            primarykey: finalId,
            centrodecusto: centrodecustoVal || null,
            vlraquisic: vlrAquisicSanitizado,
            sn1_recno: sn1RecnoVal,
            sn3_recno: sn3RecnoVal,
            _is_synced: 0,
            _is_deleted: 0,
            _conferido: statusVal?.toLowerCase()?.includes('conferido') ? 1 : 0,
            _plaquetado: 0,
            _aprovado: 0,
            _isNew: 0,
            _is_unitized: 0,
            _is_divergent_baixa: 0,
            _history: null,
            DE_PARA: null,
            _photoUrl: null,
            gps_lat: null,
            gps_lng: null,
            currentCampaignId: null
          };

          assetsToInsert.push(assetObj);
        }

        // Transação ACID atômica do Dexie com Fail-Fast
        try {
          await db.transaction('rw', [db.local_assets, db.ativos, db.assets, db.audit_logs], async () => {
            // Validação estrita de chaves primárias antes de inserir
            for (const asset of assetsToInsert) {
              if (!asset.id || !asset.primarykey) {
                throw new Error("Violência de chave de integridade: Chave primária nula ou vazia.");
              }
            }

            await db.local_assets.bulkPut(assetsToInsert);
            await db.ativos.bulkPut(assetsToInsert);
            await db.assets.bulkPut(assetsToInsert);

            // Grava logs de correção se houverem
            for (const corr of correctionsToLog) {
              const auditId = 'LOG_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase();
              await db.audit_logs.put({
                id: auditId,
                usuario: activeEmail,
                acao: 'CORRECTION_VLR_INIT_ZERO',
                tabela: 'ativos',
                registro_id: corr.id,
                details: `Saneamento de valor de aquisição corrompido para '0' na importação Excel. Valor original: ${corr.originalValue}`,
                delta: JSON.stringify({ valorOriginal: corr.originalValue }),
                updated_at: new Date().toISOString()
              });
            }
          });
        } catch (txErr) {
          logger.error(">>> [FATAL_IMPORT_CRASH] Falha crítica de integridade na transação Dexie:", txErr);
          throw new Error(`[FATAL_IMPORT_CRASH] Falha de integridade do lote: ${txErr instanceof Error ? txErr.message : String(txErr)}`);
        }

        totalInseridos += chunk.length;

        // Progresso do lote
        onProgress(batchIndex, chunk.length, totalInseridos, totalRows);
        
        // Pequeno delay artificial para renderização da esteira reativa
        await new Promise(res => setTimeout(res, 1));
      }

    } catch (importError: unknown) {
      const err = importError instanceof Error ? importError : new Error(String(importError));
      const errorMeta = {
        message: err.message,
        stack: err.stack || 'Sem stack trace'
      };
      logger.error(">>> [CRITICAL IMPORT ERROR] Falha na gravação do lote:", JSON.stringify(errorMeta));
      throw importError;
    } finally {
      // Isolamento restabelecido sem dependência de sqliteService
    }

    await DatabaseLoaderService.reportRecnoAfterLoad();
    return totalInseridos;
  }

  /**
   * REQUISITO DE CARGA EXPERT LOTE 0: INGESTÃO DA PLANILHA EXCEL COM BULK INSERT E OOM GUARD (v3.60)
   */
  public async importExcelBulkData(
    file: File,
    tenantid: string,
    unitId: string,
    onProgress: (processed: number, total: number) => void
  ): Promise<number> {
    await invalidateTenantCaseMarker();
    // 1. Validação Preventiva de Bateria Crítica (< 5% sem fonte externa)
    let currentBatteryLevel = 1.0;
    let isDeviceCharging = true;
    try {
      if (Capacitor.isNativePlatform()) {
        const info = await Device.getBatteryInfo();
        currentBatteryLevel = info.batteryLevel !== undefined ? info.batteryLevel : 1.0;
        isDeviceCharging = info.isCharging === true;
      } else {
        const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> };
        if (nav?.getBattery) {
          const battery = await nav.getBattery();
          currentBatteryLevel = battery?.level ?? 1.0;
          isDeviceCharging = battery?.charging ?? true;
        }
      }
    } catch (energyErr) {
      logger.warn(">>> [Hardware Check] Falha ao consultar subsistema de energia em importExcelBulkData:", energyErr);
    }

    const activeUserJson = typeof window !== 'undefined' ? sessionStorage?.getItem('app_current_user') : null;
    const activeUser = activeUserJson ? JSON.parse(activeUserJson) : null;
    const activeEmail = activeUser?.email || '';
    const emailValidoParaBypass = isAdminEmail(activeEmail);

    if (currentBatteryLevel < 0.05 && !isDeviceCharging) {
      if (emailValidoParaBypass) {
        logger.warn("⚡ [Soberania Admin] Bateria crítica (< 5%), bypass síncrono ativado para administrador homologado.");
      } else {
        throw new Error("FAILSAFE: Operação abortada. Bateria abaixo de 5% sem fonte externa. Risco de corrupção do cabeçalho .db.");
      }
    }

    // 2. Leitura do arquivo binário e parser via biblioteca XLSX
    const dataBuffer = await this.fileToBuffer(file);
    const workbook = XLSX.read(dataBuffer, { type: "array" });
    const firstSheetName = workbook?.SheetNames?.[0];
    if (!firstSheetName) {
      throw new Error("Planilha inválida ou vazia.");
    }
    
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Converte a planilha em JSON tipado
    let rawExcelData: Record<string, unknown>[] | null = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
    const totalPlanilha = rawExcelData?.length ?? 0;
    if (!rawExcelData || totalPlanilha === 0) {
      throw new Error("A planilha fornecida está vazia ou corrompida.");
    }
    validateSpreadsheetContract(worksheet);

    // Captura o conteúdo real do campo 'filial' (Index 1) da planilha carregada
    let firstFilial = '';
    for (const row of rawExcelData) {
      const filialVal = String(getRowValue(row, 'filial', 'unidade', 'unit', 'unitid', 'unit_id') || '')?.trim();
      if (filialVal && filialVal.toLowerCase() !== 'null' && filialVal.toLowerCase() !== 'undefined') {
        firstFilial = filialVal;
        break;
      }
    }
    if (firstFilial) {
      logger.info(`>>> [SRE Loader] Unidade Física Real detectada no Index 1 (filial): ${firstFilial}`);
      localStorage.setItem('filial', firstFilial);
      sessionStorage.setItem('filial', firstFilial);
      localStorage.setItem('selectedUnit', firstFilial);
      sessionStorage.setItem('selectedUnit', firstFilial);
      localStorage.setItem('app_selected_unit', firstFilial);
      localStorage.setItem('app_current_unit', firstFilial);
    }

    const totalRows = totalPlanilha;
    let totalInserted = 0;

    // FASE 1 (SRE): Escrita silenciosa usando o handle global isolado (sem abrir popup)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirHandle = (window as any).globalSreDirectoryHandle;
      if (dirHandle) {
        const fileHandle = await dirHandle.getFileHandle(`PLANILHA_${unitId.toUpperCase()}.json`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(rawExcelData));
        await writable.close();
        logger.info(`>>> [SRE] Backup físico 100% Offline ancorado silenciosamente`);
      }
    } catch (ioErr) {
      logger.warn(">>> [SRE] Erro silencioso na ancoragem física:", ioErr);
    }

    try {
      const BATCH_SIZE = 200;
      const allocateFallbackKey = createFallbackKeyAllocator();
      for (let i = 0; i < totalRows; i += BATCH_SIZE) {
        const chunk = rawExcelData.slice(i, Math.min(i + BATCH_SIZE, totalRows));
        const assetsToInsert: DexieAsset[] = [];
        const correctionsToLog: { id: string; originalValue: unknown }[] = [];

        for (const row of chunk) {
          const finalFilialRaw = mirrorFilial(getRowValue(row, 'filial', 'unidade', 'unit', 'unitid', 'unit_id') || unitId);
          const finalFilial = finalFilialRaw.toUpperCase();
          const finalTenantid = resolveTenantKey(getRowValue(row, 'tenantid'));
          // Chave canônica única (utils/assetKey) — a mesma de todos os caminhos.
          const primarykeyVal = sanitizeAssetKey(getRowValue(row, 'primarykey'));
          const tagSanitizada = sanitizeAssetKey(getRowValue(row, 'etiqueta', 'tag'));
          const finalId = primarykeyVal || tagSanitizada
            || allocateFallbackKey(finalTenantid, finalFilial, contentFingerprint(row as Record<string, unknown>));
          const itemDesc = normalizeFieldValue('descricaodoativo', getRowValue(row, 'descricaodoativo', 'descricao', 'item')) ?? `Ativo N-${finalId}`;
          const finalRegistro = normalizeFieldValue('registro', getRowValue(row, 'registro') || `REG-${finalId}`);
          const finalQt = String(getRowValue(row, 'qt') !== undefined ? getRowValue(row, 'qt') : '1')?.trim();
          const contaContabil = normalizeFieldValue('contacontabil', getRowValue(row, 'contacontabil', 'conta_contabil') || 'SEM CONTA');
          const statusVal = normalizeFieldValue('status', getRowValue(row, 'status') || 'Pendente') ?? 'Pendente';

          const serialVal = normalizeFieldValue('serial', getRowValue(row, 'serial', 'serial_number'));
          const dataaqVal = normalizeDateISO(getRowValue(row, 'dataaqusic', 'dataaquisic'));
          const cnpjVal = normalizeFieldValue('cnpj', getRowValue(row, 'cnpj'));
          const fornecedorVal = normalizeFieldValue('nomefornecedor', getRowValue(row, 'nomefornecedor', 'fornecedor'));
          const nfVal = normalizeFieldValue('notafiscal', getRowValue(row, 'notafiscal'));
          const finalEndereco = normalizeFieldValue('endereco', getRowValue(row, 'endereco', 'end', 'localizacao', 'localização', 'localidade', 'physicallocalization', 'loc', 'local', 'sala', 'posicao', 'posição'));
          const subregVal = normalizeFieldValue('subreg', getRowValue(row, 'subreg'));
          const databaixaVal = normalizeDateISO(getRowValue(row, 'databaixa'));
          const centrodecustoVal = normalizeFieldValue('centrodecusto', getRowValue(row, 'centrodecusto', 'centro_custo'));

          const sn1RecnoRaw = getRowValue(row, 'sn1_recno');
          const sn3RecnoRaw = getRowValue(row, 'sn3_recno');
          const sn1RecnoVal = normalizeNumeric(sn1RecnoRaw);
          const sn3RecnoVal = normalizeNumeric(sn3RecnoRaw);

          // Higienização de Valor de Aquisição
          let vlrAquisicSanitizado = 0;
          let precisaLogarErro = false;
          const valorOriginalRaw = getRowValue(row, 'vlraquisic');

          if (valorOriginalRaw !== undefined && valorOriginalRaw !== null) {
            if (typeof valorOriginalRaw === 'number') {
              vlrAquisicSanitizado = isNaN(valorOriginalRaw) ? 0 : valorOriginalRaw;
              if (isNaN(valorOriginalRaw)) precisaLogarErro = true;
            } else {
              const cleanStr = String(valorOriginalRaw).replace(/[R$\s]/gi, '');
              if (cleanStr.includes(',') && cleanStr.includes('.')) {
                vlrAquisicSanitizado = parseFloat(cleanStr.replace(/\./g, '').replace(/,/g, '.'));
              } else if (cleanStr.includes(',')) {
                vlrAquisicSanitizado = parseFloat(cleanStr.replace(/,/g, '.'));
              } else {
                vlrAquisicSanitizado = parseFloat(cleanStr);
              }
              if (isNaN(vlrAquisicSanitizado)) {
                vlrAquisicSanitizado = 0;
                precisaLogarErro = true;
              }
            }
          }

          if (precisaLogarErro) {
            correctionsToLog.push({ id: finalId, originalValue: valorOriginalRaw });
          }

          const assetObj: DexieAsset = {
            id: finalId,
            tenantid: finalTenantid,
            filial: finalFilial,
            filial_raw: finalFilialRaw,
            status: statusVal,
            etiqueta: tagSanitizada,
            tag: tagSanitizada,
            qt: Number(finalQt || 1),
            descricaodoativo: itemDesc,
            serial: serialVal || null,
            dataaqusic: dataaqVal || null,
            cnpj: cnpjVal || null,
            nomefornecedor: fornecedorVal || null,
            notafiscal: nfVal || null,
            endereco: finalEndereco || null,
            registro: finalRegistro || null,
            subreg: subregVal || null,
            databaixa: databaixaVal || null,
            contacontabil: contaContabil || null,
            primarykey: finalId,
            centrodecusto: centrodecustoVal || null,
            vlraquisic: vlrAquisicSanitizado,
            sn1_recno: sn1RecnoVal,
            sn3_recno: sn3RecnoVal,
            _is_synced: 0,
            _is_deleted: 0,
            _conferido: statusVal?.toLowerCase()?.includes('conferido') ? 1 : 0,
            _plaquetado: 0,
            _aprovado: 0,
            _isNew: 0,
            _is_unitized: 0,
            _is_divergent_baixa: 0,
            _history: null,
            DE_PARA: null,
            _photoUrl: null,
            gps_lat: null,
            gps_lng: null,
            currentCampaignId: null
          };

          assetsToInsert.push(assetObj);
        }

        // DESCARGA NO ARMAZENAMENTO LOCAL (Transação ACID atômica com Fail-Fast)
        try {
          await db.transaction('rw', [db.local_assets, db.ativos, db.assets, db.audit_logs], async () => {
            // Validação estrita antes da gravação
            for (const asset of assetsToInsert) {
              if (!asset.id || !asset.primarykey) {
                throw new Error("Violência de chave de integridade: Chave primária nula ou vazia.");
              }
            }

            await db.local_assets.bulkPut(assetsToInsert);
            await db.ativos.bulkPut(assetsToInsert);
            await db.assets.bulkPut(assetsToInsert);

            // Gravação dos logs de correção
            for (const corr of correctionsToLog) {
              const auditId = 'LOG_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase();
              await db.audit_logs.put({
                id: auditId,
                usuario: activeEmail,
                acao: 'CORRECTION_VLR_INIT_ZERO',
                tabela: 'ativos',
                registro_id: corr.id,
                details: `Saneamento de valor de aquisição corrompido para '0' na importação Excel. Valor original: ${corr.originalValue}`,
                delta: JSON.stringify({ valorOriginal: corr.originalValue }),
                updated_at: new Date().toISOString()
              });
            }
          });
        } catch (txErr) {
          logger.error(">>> [FATAL_IMPORT_CRASH] Falha de integridade na transação em lote:", txErr);
          throw new Error(`[FATAL_IMPORT_CRASH] Falha de integridade do lote: ${txErr instanceof Error ? txErr.message : String(txErr)}`);
        }

        totalInserted += chunk.length;
        if (onProgress) {
          onProgress(totalInserted, totalRows);
        }

        // Pequeno delay artificial para renderização da esteira reativa
        await new Promise(res => setTimeout(res, 1));
      }

    } finally {
      // COLETA DE LIXO (OOM Guard Ativo): Libera memória e anula referências
      rawExcelData = null;
    }

    await DatabaseLoaderService.reportRecnoAfterLoad();
    return totalInserted;
  }

  /**
   * Converte o arquivo carregado em Buffer binário na memória RAM para leitura XLSX
   */
  private fileToBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          resolve(e.target.result);
        } else {
          reject(new Error("Falha ao ler dados binários do arquivo."));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
}

export const databaseLoaderService = new DatabaseLoaderService();

/**
 * Repõe os três espelhos com o snapshot dado, na mesma transação.
 *
 * Canoniza o `tenantid` de cada linha (UPPER + contrato da sessão quando vazio):
 * caminho único dos dois restauros, para que nem variantes de case nem chaves
 * `['', primarykey]` cheguem à base. Invalida o marcador de case porque o
 * snapshot pode trazer `tenantid` não canónico. Devolve as linhas repostas.
 */
async function replaceAssetMirrors(rows: unknown[]): Promise<number> {
  const snapshot = (rows as DexieAsset[]).map(asset => ({
    ...asset,
    tenantid: resolveTenantKey(asset.tenantid)
  }));
  if (snapshot.length === 0) return 0;

  await invalidateTenantCaseMarker();
  await db.transaction('rw', [db.local_assets, db.ativos, db.assets], async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();

    // O backup é uma cópia integral dos ativos: os três espelhos recebem-na
    // (dashboards, mapa e sync leem `ativos`/`assets`, não só `local_assets`).
    await db.local_assets.bulkPut(snapshot);
    await db.ativos.bulkPut(snapshot);
    await db.assets.bulkPut(snapshot);
  });

  return snapshot.length;
}

export async function verifyAndRestorePhysicalBackup(): Promise<boolean> {
  try {
    const fileContent = await Filesystem.readFile({
      path: 'GBR_KARDEK_DATA/local_assets_secure.dat',
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    });

    if (fileContent.data) {
      const backup = JSON.parse(fileContent.data as string);
      if (!Array.isArray(backup) || backup.length === 0) return false;
      return (await replaceAssetMirrors(backup)) > 0;
    }
  } catch {
    // Arquivo ainda não criado no primeiro boot limpo (Comportamento Esperado)
  }
  return false;
}

/**
 * Restauro manual do backup em JSON escolhido no painel do gestor.
 *
 * O ficheiro pode trazer `tenantid` em qualquer casing — ou vazio; a canonização
 * fica em `replaceAssetMirrors`. Devolve o número de linhas repostas.
 */
export async function restoreBackupSnapshot(rows: unknown[]): Promise<number> {
  return replaceAssetMirrors(rows);
}

/**
 * Restauro do inventário legado lido do FileSystem físico (`GBR_Inventario`).
 *
 * Grava as linhas em `local_assets` e concilia o espelho operacional `ativos`
 * pela chave composta `[tenantid+primarykey]` — com chave simples o `update`
 * não encontra a linha e o registo restaurado ficaria por conferir. Devolve
 * quantas linhas foram restauradas (0 quando o backup está vazio).
 */
export async function restoreLegacyPhysicalInventory(rows: unknown[]): Promise<number> {
  // Tenant vazio adopta o contrato da sessão: `['', primarykey]` nunca coincide
  // com a linha operacional e o restauro ficaria órfão.
  const data = (rows as DexieAsset[]).map(asset => ({
    ...asset,
    tenantid: resolveTenantKey(asset.tenantid)
  }));
  if (data.length === 0) return 0;

  await db.transaction('rw', [db.local_assets, db.ativos], async () => {
    // Restaura estritamente o inventário coletado pelo usuário (coletas locais).
    await db.local_assets.bulkPut(data);

    // `data` já tem o tenant canónico: a chave composta usa-o directamente.
    for (const asset of data) {
      if (!asset.primarykey) continue;
      await db.ativos.update(
        [asset.tenantid, String(asset.primarykey)],
        { _conferido: 1, _is_synced: 0 }
      );
    }
  });

  return data.length;
}

export async function initializeLocalLoaderPipeline(): Promise<void> {
  logger.info("[SRE GESTOR] Inicializando barramento de carga estrutural local...");
  
  try {
    // Força a varredura e restauração a partir do diretório físico C:\GBR_Inventario independente da plataforma
    const hasData = await verifyAndRestorePhysicalBackup();
    
    if (hasData) {
      logger.info("[SRE GESTOR] Estado físico restaurado com sucesso a partir do disco local.");
    } else {
      logger.info("[SRE GESTOR] Banco local limpo. Aguardando importação manual da planilha pelo painel.");
    }
  } catch (error) {
    logger.error("[SRE CRÍTICO] Falha ao acionar barramento interno de disco:", error);
  }
}
