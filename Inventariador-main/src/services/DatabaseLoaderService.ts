import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import * as XLSX from 'xlsx';
import { db, DexieAsset, invalidateTenantCaseMarker, gravarAuditoria } from './sqliteService';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { isAdminEmail } from '../utils/authUtils';
import { logger } from '../utils/logger';
import { normalizeDateISO, normalizeNumeric } from '../utils/normalize';
import { isConferido } from '../utils/conferencia';
import { marcarAlteracaoLocal } from '../utils/pendencia';
import { createAssetIdentityAllocator, newImportBatchId, sourcePrimarykeyOf, type AssetIdentityCandidate } from '../utils/assetIdentity';
import { reconcileImport, ImportReconciliationError, type LoadedAssetRef } from '../utils/importReconciliation';
import { reportRecnoCollisions } from './recnoGuardService';

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

/** Colunas aceites como 'filial' da planilha (o contrato fixa a posição 1). */
const FILIAL_KEYS = ['filial', 'unidade', 'unit', 'unitid', 'unit_id'] as const;

/** Filial utilizável da célula: vazio, `null` e `undefined` não contam. */
const usableFilial = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const probe = raw.trim().toLowerCase();
  return probe === '' || probe === 'null' || probe === 'undefined' ? '' : raw;
};

/**
 * FILIAL ÚNICA das três vias de carga (`injetarDadosEmLotes`,
 * `processExcelFile`, `importExcelBulkData`).
 *
 * Antes, `processExcelFile`/`importExcelBulkData` liam
 * `filial || unidade || unit || unitid || unit_id` com fallback para a unidade
 * do operador, e `injetarDadosEmLotes` (o caminho do Gestor de Base) lia só
 * `filial`. A MESMA linha do arquivo saía com filiais diferentes — e, como a
 * identidade derivada (`fallbackAssetKey`) usa a filial, reimportar o mesmo
 * ficheiro por outra via criava registos novos em vez de os substituir.
 */
const resolveFilialRaw = (row: Record<string, unknown>, unitId?: string): string =>
  mirrorFilial(usableFilial(getRowValue(row, ...FILIAL_KEYS)) || usableFilial(unitId));

/** Linha sem nenhuma célula preenchida — não é um registo da planilha. */
const isEmptySpreadsheetRow = (row: Record<string, unknown> | unknown[]): boolean => {
  const cells = Array.isArray(row) ? row : Object.values(row);
  return cells.every((cell) => cell === undefined || cell === null || String(cell).trim() === '');
};

/**
 * CONTRATO SRE (planilha): TODA a linha preenchida tem de trazer `tenantid`.
 *
 * Antes só se bloqueava quando a coluna estava vazia em todas as linhas. Uma
 * linha isolada sem tenantid entrava com a chave composta `['', primarykey]`,
 * misturando contratos diferentes no mesmo registo. A mensagem nomeia as linhas
 * do arquivo (1 = cabeçalho) para o operador as corrigir.
 */
function assertTenantInEveryRow(
  rows: Array<Record<string, unknown> | unknown[]>,
  lineOf: (index: number) => number
): void {
  const missing: number[] = [];
  rows.forEach((row, index) => {
    if (isEmptySpreadsheetRow(row)) return;
    const value = Array.isArray(row) ? row[0] : getRowValue(row, 'tenantid');
    if (value === undefined || value === null || String(value).trim() === '') missing.push(lineOf(index));
  });
  if (missing.length === 0) return;

  const shown = missing.slice(0, 10).map((line) => `linha ${line}`).join(', ');
  const more = missing.length > 10 ? `, … e mais ${missing.length - 10}` : '';
  const msg =
    `CARGA BLOQUEADA: ${missing.length} linha(s) sem 'tenantid' (Índice 0). ` +
    `Preencha o tenantid de cada ativo na planilha antes de carregar. Linhas: ${shown}${more}.`;
  logger.error(`[SRE_LOADER] ${msg}`);
  throw new Error(msg);
}

const CONTRACT_HEADERS = [
  'tenantid', 'filial', 'status', 'etiqueta', 'qt', 'descricaodoativo', 'serial',
  'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal', 'endereco', 'registro',
  'subreg', 'databaixa', 'contacontabil', 'primarykey', 'centrodecusto',
  'vlraquisic', 'sn1_recno', 'sn3_recno'
];

const CONTRACT_HEADERS_TEXT = CONTRACT_HEADERS.join(';');

/**
 * CÓPIA LITERAL DA PLANILHA — regra da carga.
 *
 * O valor é gravado EXATAMENTE como está na célula: sem `trim`, sem mudança de
 * caixa, sem expurgo de espaços/separadores e sem colapso de espaços duplos.
 * Antes, `etiqueta`/`tag` passavam por `sanitizeAssetKey` e `008810 CICOPAL`
 * entrava na base como `008810CICOPAL` — o registo deixava de ser a cópia do
 * arquivo e não voltava 1:1 para o ERP.
 *
 * A identidade do registo continua a ser a chave canónica (`primarykey`
 * calculada por `utils/assetIdentity`), que é interna e não substitui o dado.
 */
const literalText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  return String(value);
};

/** Linha da planilha copiada campo a campo, com os 21 cabeçalhos do contrato. */
const sourceRowLiteral = (row: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const header of CONTRACT_HEADERS) {
    const value = getRowValue(row, header);
    out[header] = value === null || value === undefined ? '' : String(value);
  }
  return out;
};

/**
 * Valor de aquisição para a coluna numérica. Aceita número, `1.234,56`,
 * `R$ 1.234,56` e `1234.56`. O texto original fica em `_sourceRow.vlraquisic`;
 * aqui só se evita gravar `0` para um valor que a planilha trazia.
 */
const parseAssetValue = (raw: unknown): { value: number; invalid: boolean } => {
  if (raw === null || raw === undefined || raw === '') return { value: 0, invalid: false };
  if (typeof raw === 'number') return Number.isNaN(raw) ? { value: 0, invalid: true } : { value: raw, invalid: false };

  const cleanStr = String(raw).replace(/[R$\s]/gi, '');
  let value: number;
  if (cleanStr.includes(',') && cleanStr.includes('.')) {
    value = parseFloat(cleanStr.replace(/\./g, '').replace(/,/g, '.'));
  } else if (cleanStr.includes(',')) {
    value = parseFloat(cleanStr.replace(/,/g, '.'));
  } else {
    value = parseFloat(cleanStr);
  }
  return Number.isNaN(value) ? { value: 0, invalid: true } : { value, invalid: false };
};

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

  // 3) Cada linha preenchida tem de trazer tenantid — com o número da linha.
  const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;
  const firstRow = range ? range.s.r : 0;
  assertTenantInEveryRow(aoa.slice(1), (index) => firstRow + index + 2);
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

  /**
   * RECONCILIAÇÃO DA CARGA (planilha × base, por filial).
   *
   * Lê de volta da base as chaves que esta carga mandou gravar e exige
   * `planilha N = base N`. Se o `bulkPut` substituiu uma linha (chave repetida
   * no arquivo) ou trocou a filial (mesma chave noutra filial), a carga para
   * aqui, com o relatório no terminal e em `audit_logs` — em vez de devolver
   * "sucesso" contando linhas que não ficaram na base.
   */
  private static async verifyLoadedRows(carregadas: LoadedAssetRef[]): Promise<void> {
    if (carregadas.length === 0) return;

    const found: LoadedAssetRef[] = [];
    const READ_CHUNK = 500;
    const unique = new Map<string, [string, string]>();
    for (const ref of carregadas) {
      unique.set(`${ref.tenantid}\u0000${ref.primarykey}`, [ref.tenantid, ref.primarykey]);
    }
    const keys = Array.from(unique.values());

    for (let i = 0; i < keys.length; i += READ_CHUNK) {
      const lote = keys.slice(i, i + READ_CHUNK);
      const rows = (await db.local_assets
        .where('[tenantid+primarykey]')
        .anyOf(lote)
        .toArray()) as unknown as DexieAsset[];
      rows.forEach((row) => {
        found.push({
          tenantid: String(row.tenantid ?? ''),
          filial: String(row.filial_raw || row.filial || ''),
          primarykey: String(row.primarykey ?? ''),
          source_primarykey: row.source_primarykey ?? null,
          import_batch: row.import_batch ?? null
        });
      });
    }

    // Linhas que ficaram na base dos escopos tocados por esta carga: é aqui que
    // se procura o que uma reimportação deixou para trás (identidade antiga da
    // MESMA chave de origem). Lê-se após a gravação, por (tenantid + filial).
    const existentes: LoadedAssetRef[] = [];
    const escopos = new Map<string, [string, string]>();
    for (const ref of carregadas) {
      const tenantid = String(ref.tenantid ?? '').trim().toUpperCase();
      if (!tenantid) continue;
      const filial = String(ref.filial ?? '').trim().toUpperCase();
      escopos.set(`${tenantid}\u0000${filial}`, [tenantid, filial]);
    }
    for (const [tenantid, filial] of escopos.values()) {
      const rows = (await db.local_assets
        .where('[tenantid+filial]')
        .equals([tenantid, filial])
        .toArray()) as unknown as DexieAsset[];
      rows.forEach((row) => {
        existentes.push({
          tenantid: String(row.tenantid ?? ''),
          filial: String(row.filial_raw || row.filial || ''),
          primarykey: String(row.primarykey ?? ''),
          source_primarykey: row.source_primarykey ?? null,
          import_batch: row.import_batch ?? null
        });
      });
    }

    const report = reconcileImport(carregadas, found, existentes);
    report.lines.forEach((line) => (report.ok ? logger.info(line) : logger.error(line)));

    try {
      await gravarAuditoria({
        id: `RECON_${Date.now()}_${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
        usuario: 'CARGA_PLANILHA',
        acao: 'IMPORT_RECONCILIATION',
        tabela: 'local_assets',
        registro_id: String(report.planilha),
        details: report.lines.join(' · '),
        delta: JSON.stringify({
          ok: report.ok,
          planilha: report.planilha,
          gravadas: report.gravadas,
          distinctKeys: report.distinctKeys,
          duplicateKeys: report.duplicateKeys,
          missing: report.missing,
          wrongFilial: report.wrongFilial,
          orphans: report.orphans.length,
          orphanKeys: report.orphans.slice(0, 50).map((orphan) => orphan.primarykey),
          perFilial: report.perFilial
        })
      });
    } catch (auditErr) {
      logger.warn('[CARGA] Falha ao registar a reconciliação em audit_logs:', auditErr);
    }

    if (!report.ok) throw new ImportReconciliationError(report);
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

  static async injetarDadosEmLotes(
    dadosBrutos: unknown[],
    onProgresso?: (porcentagem: number) => void,
    unitId?: string
  ): Promise<number> {
    // Carga nova pode reintroduzir tenantid não canónico: invalida o marcador.
    await invalidateTenantCaseMarker();
    // Regra do contrato também neste caminho: sem tenantid a chave composta
    // viraria `['', primarykey]`. Número da linha = ordem da linha de dados.
    assertTenantInEveryRow(dadosBrutos as Array<Record<string, unknown>>, (index) => index + 1);
    let registrosProcessados = 0;
    // Fase 2 — identidade INTERNA + proveniência da linha (source_row/import_batch).
    const importBatch = newImportBatchId();
    const identityCandidate = (row: Record<string, unknown>): AssetIdentityCandidate => ({
      tenantid: String(getRowValue(row, 'tenantid') || '').trim().toUpperCase(),
      filial: resolveFilialRaw(row, unitId),
      sourcePrimarykey: getRowValue(row, 'primarykey'),
      etiqueta: getRowValue(row, 'etiqueta', 'tag'),
      tag: getRowValue(row, 'tag'),
      row
    });
    // O arquivo inteiro é pré-contado: uma base repetida deixa de ser identidade.
    const identities = createAssetIdentityAllocator()
      .prime((dadosBrutos as Record<string, unknown>[]).map(identityCandidate));
    // Uma referência por linha da planilha: é o lado "planilha" da reconciliação.
    const carregadas: LoadedAssetRef[] = [];

    for (let i = 0; i < dadosBrutos.length; i += this.CHUNK_SIZE) {
      const loteBruto = dadosBrutos.slice(i, i + this.CHUNK_SIZE) as Record<string, unknown>[];
      
      const loteHigienizado: DexieAsset[] = loteBruto.map((row, rowIndex) => {
        // REGRA DE CONTRATO (planilha): o tenantid NUNCA tem valor fixo/fallback.
        // Ele vem EXCLUSIVAMENTE da coluna 'tenantid' (Índice 0) da planilha.
        const tenantid = String(getRowValue(row, 'tenantid') || '').trim().toUpperCase();
        const rawFilial = resolveFilialRaw(row, unitId);
        // Fase 2 — identidade INTERNA: `primarykey` da planilha quando ela é
        // única no arquivo; repetida recebe chave derivada (pk + conteúdo) para
        // a segunda linha NÃO substituir a primeira. `source_primarykey` guarda
        // o texto literal da célula.
        const identityInput = identityCandidate(row);
        const identity = identities.allocate(identityInput);
        const pk = identity.primarykey;
        const sourcePrimarykey = sourcePrimarykeyOf(identityInput.sourcePrimarykey);
        // Coluna canônica da planilha: 'endereco' (posição 11 do contrato). O nome 'codigo_endereco'
        // era lido antes e NÃO existe no contrato → gravava endereco: null para todos os ativos,
        // deixando o AddressSelector vazio. Fallbacks aceitos para tolerância de nomes de coluna.
        const codEnd = literalText(getRowValue(row, 'endereco', 'localizacao', 'localização', 'localidade', 'physicallocalization', 'loc', 'local', 'sala', 'posicao', 'posição', 'codigo_endereco'));
        // Texto exato da etiqueta (espaços e caixa preservados). A chave `pk`
        // continua canónica — é identidade interna, não o dado do cliente.
        const etiquetaLiteral = literalText(getRowValue(row, 'tag')) || literalText(getRowValue(row, 'etiqueta')) || pk;
        const statusVal = literalText(getRowValue(row, 'status')) || 'Pendente';
        // A planilha é a fonte da conferência: o texto `status` («CONFERIDO…»)
        // e a coluna de auditoria dizem a mesma coisa, e quem lê é a regra única.
        // Gravar `_conferido: 0` fixo aqui fazia o Gestor de Base carregar a
        // planilha inteira como pendente.
        const conferidoNaPlanilha = statusVal.toLowerCase().includes('conferido');

        return {
          id: pk,
          primarykey: pk,
          tenantid: tenantid,
          // `filial` é a chave indexada (maiúscula, como as consultas esperam);
          // `filial_raw` guarda o texto exato da planilha para exibição.
          filial: rawFilial.toUpperCase(),
          filial_raw: rawFilial,
          status: statusVal,
          etiqueta: etiquetaLiteral,
          tag: etiquetaLiteral,
          qt: isNaN(Number(row.qt)) ? 1 : Number(row.qt),
          descricaodoativo: literalText(getRowValue(row, 'descricaodoativo', 'descricao', 'item')) || `Ativo N-${pk}`,
          serial: literalText(row.serial),
          dataaqusic: normalizeDateISO(getRowValue(row, 'dataaqusic', 'dataaquisic')),
          cnpj: literalText(row.cnpj),
          nomefornecedor: literalText(getRowValue(row, 'nomefornecedor', 'fornecedor')),
          notafiscal: literalText(row.notafiscal),
          endereco: codEnd || null,
          registro: literalText(row.registro),
          subreg: literalText(row.subreg),
          databaixa: normalizeDateISO(getRowValue(row, 'databaixa')),
          contacontabil: literalText(row.contacontabil),
          centrodecusto: literalText(row.centrodecusto),
          vlraquisic: parseAssetValue(row.vlraquisic).value,
          sn1_recno: normalizeNumeric(row.sn1_recno),
          sn3_recno: normalizeNumeric(row.sn3_recno),
          // Cópia literal da linha inteira (inclui datas e valores como escritos).
          _sourceRow: sourceRowLiteral(row),
          source_primarykey: sourcePrimarykey,
          source_row: i + rowIndex + 1,
          import_batch: importBatch,
          ...marcarAlteracaoLocal(),
          _is_deleted: 0,
          _conferido: isConferido({
            _conferido: conferidoNaPlanilha,
            AUDITOR_STATUS_CONFERENCIA: getRowValue(row, 'AUDITOR_STATUS_CONFERENCIA')
          }) ? 1 : 0,
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

      loteHigienizado.forEach((asset) => carregadas.push({
        tenantid: asset.tenantid,
        filial: asset.filial_raw || asset.filial,
        primarykey: asset.primarykey,
        source_primarykey: asset.source_primarykey ?? null
      }));

      // Transação ACID atômica por bloco para mitigar Race Conditions
      await db.transaction('rw', [db.ativos, db.local_assets], async () => {
        await db.ativos.bulkPut(loteHigienizado);
        await db.local_assets.bulkPut(loteHigienizado);
      });

      registrosProcessados += loteHigienizado.length;
      if (onProgresso) {
        onProgresso(Math.round((registrosProcessados / dadosBrutos.length) * 100));
      }
      logger.info(`[SRE_LOADER] Lote injetado. Progresso: ${registrosProcessados}/${dadosBrutos.length}`);
    }
    await DatabaseLoaderService.verifyLoadedRows(carregadas);
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
    // Fase 2 — identidade INTERNA + proveniência (source_row/import_batch).
    const importBatch = newImportBatchId();
    const identityCandidate = (row: Record<string, unknown>): AssetIdentityCandidate => ({
      tenantid: String(getRowValue(row, 'tenantid') || '').trim().toUpperCase(),
      filial: resolveFilialRaw(row, unitId),
      sourcePrimarykey: getRowValue(row, 'primarykey'),
      etiqueta: getRowValue(row, 'etiqueta', 'tag'),
      tag: getRowValue(row, 'tag'),
      row
    });
    const identities = createAssetIdentityAllocator()
      .prime((rawRows as unknown as Record<string, unknown>[]).map(identityCandidate));
    // Uma referência por linha da planilha: é o lado "planilha" da reconciliação.
    const carregadas: LoadedAssetRef[] = [];

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
      for (let i = 0; i < totalRows; i += this.BATCH_SIZE) {
        batchIndex++;
        const chunk = rawRows.slice(i, Math.min(i + this.BATCH_SIZE, totalRows));
        const assetsToInsert: DexieAsset[] = [];
        const correctionsToLog: { id: string; originalValue: unknown }[] = [];

        for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex++) {
          const row = chunk[chunkIndex];
          const finalFilialRaw = resolveFilialRaw(row as Record<string, unknown>, unitId);
          const finalFilial = finalFilialRaw.toUpperCase();
          const finalTenantid = String(getRowValue(row, 'tenantid') || '').trim().toUpperCase();
          // Fase 2 — identidade INTERNA (mesmo algoritmo em todos os caminhos):
          // `primarykey` única vira a chave; repetida recebe chave derivada.
          const identityInput = identityCandidate(row as Record<string, unknown>);
          const finalId = identities.allocate(identityInput).primarykey;
          const sourcePrimarykey = sourcePrimarykeyOf(identityInput.sourcePrimarykey);
          // Dado do cliente: literal. Só a chave (`finalId`) é canónica.
          const etiquetaLiteral = literalText(getRowValue(row, 'etiqueta', 'tag')) || finalId;
          const itemDesc = literalText(
            getRowValue(row, 'descricaodoativo', 'descricao', 'item')
          ) || `Ativo N-${finalId}`;
          const finalRegistro = literalText(getRowValue(row, 'registro')) || `REG-${finalId}`;
          const finalQt = String(getRowValue(row, 'qt') !== undefined ? getRowValue(row, 'qt') : '1')?.trim();
          const contaContabil = literalText(getRowValue(row, 'contacontabil', 'conta_contabil')) || 'SEM CONTA';
          const statusVal = literalText(getRowValue(row, 'status')) || 'Pendente';
          // A planilha é a fonte da conferência: o texto `status` («CONFERIDO…»)
          // e a coluna de auditoria dizem a mesma coisa, e quem lê é a regra única.
          const conferidoNaPlanilha = statusVal.toLowerCase().includes('conferido');

          const serialVal = literalText(getRowValue(row, 'serial', 'serial_number'));
          const dataaqVal = normalizeDateISO(getRowValue(row, 'dataaqusic', 'dataaquisic'));
          const cnpjVal = literalText(getRowValue(row, 'cnpj'));
          const fornecedorVal = literalText(getRowValue(row, 'nomefornecedor', 'fornecedor'));
          const nfVal = literalText(getRowValue(row, 'notafiscal'));
          const finalEndereco = literalText(getRowValue(row, 'endereco', 'end', 'localizacao', 'localização', 'localidade', 'physicallocalization', 'loc', 'local', 'sala', 'posicao', 'posição'));
          const subregVal = literalText(getRowValue(row, 'subreg'));
          const databaixaVal = normalizeDateISO(getRowValue(row, 'databaixa'));
          const centrodecustoVal = literalText(getRowValue(row, 'centrodecusto', 'centro_custo'));
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
            etiqueta: etiquetaLiteral,
            tag: etiquetaLiteral,
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
            // Cópia literal da linha inteira (inclui datas e valores como escritos).
            _sourceRow: sourceRowLiteral(row as Record<string, unknown>),
            source_primarykey: sourcePrimarykey,
            source_row: i + chunkIndex + 1,
            import_batch: importBatch,
            ...marcarAlteracaoLocal(),
            _is_deleted: 0,
            _conferido: isConferido({
              _conferido: conferidoNaPlanilha,
              AUDITOR_STATUS_CONFERENCIA: getRowValue(row as Record<string, unknown>, 'AUDITOR_STATUS_CONFERENCIA')
            }) ? 1 : 0,
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

        assetsToInsert.forEach((asset) => carregadas.push({
          tenantid: asset.tenantid,
          filial: asset.filial_raw || asset.filial,
          primarykey: asset.primarykey,
          source_primarykey: asset.source_primarykey ?? null
        }));

        // Transação ACID atômica do Dexie com Fail-Fast
        try {
          await db.transaction('rw', [db.local_assets, db.ativos, db.audit_logs], async () => {
            // Validação estrita de chaves primárias antes de inserir
            for (const asset of assetsToInsert) {
              if (!asset.id || !asset.primarykey) {
                throw new Error("Violência de chave de integridade: Chave primária nula ou vazia.");
              }
            }

            await db.local_assets.bulkPut(assetsToInsert);
            await db.ativos.bulkPut(assetsToInsert);

            // Grava logs de correção se houverem
            for (const corr of correctionsToLog) {
              await gravarAuditoria({
                usuario: activeEmail,
                acao: 'CORRECTION_VLR_INIT_ZERO',
                tabela: 'ativos',
                registro_id: corr.id,
                details: `Saneamento de valor de aquisição corrompido para '0' na importação Excel. Valor original: ${corr.originalValue}`,
                delta: JSON.stringify({ valorOriginal: corr.originalValue })
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

    await DatabaseLoaderService.verifyLoadedRows(carregadas);
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
    // Fase 2 — identidade INTERNA + proveniência (source_row/import_batch).
    const importBatch = newImportBatchId();
    const identityCandidate = (row: Record<string, unknown>): AssetIdentityCandidate => ({
      tenantid: String(getRowValue(row, 'tenantid') || '').trim().toUpperCase(),
      filial: resolveFilialRaw(row, unitId),
      sourcePrimarykey: getRowValue(row, 'primarykey'),
      etiqueta: getRowValue(row, 'etiqueta', 'tag'),
      tag: getRowValue(row, 'tag'),
      row
    });
    // Uma referência por linha da planilha: é o lado "planilha" da reconciliação.
    const carregadas: LoadedAssetRef[] = [];

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
      const identityRows: Record<string, unknown>[] = rawExcelData;
      const identities = createAssetIdentityAllocator().prime(identityRows.map(identityCandidate));
      for (let i = 0; i < totalRows; i += BATCH_SIZE) {
        const chunk = rawExcelData.slice(i, Math.min(i + BATCH_SIZE, totalRows));
        const assetsToInsert: DexieAsset[] = [];
        const correctionsToLog: { id: string; originalValue: unknown }[] = [];

        for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex++) {
          const row = chunk[chunkIndex];
          const finalFilialRaw = resolveFilialRaw(row, unitId);
          const finalFilial = finalFilialRaw.toUpperCase();
          const finalTenantid = String(getRowValue(row, 'tenantid') || '').trim().toUpperCase();
          // Fase 2 — identidade INTERNA (mesmo algoritmo em todos os caminhos):
          // `primarykey` única vira a chave; repetida recebe chave derivada.
          const identityInput = identityCandidate(row as Record<string, unknown>);
          const finalId = identities.allocate(identityInput).primarykey;
          const sourcePrimarykey = sourcePrimarykeyOf(identityInput.sourcePrimarykey);
          // Dado do cliente: literal. Só a chave (`finalId`) é canónica.
          const etiquetaLiteral = literalText(getRowValue(row, 'etiqueta', 'tag')) || finalId;
          const itemDesc = literalText(getRowValue(row, 'descricaodoativo', 'descricao', 'item')) || `Ativo N-${finalId}`;
          const finalRegistro = literalText(getRowValue(row, 'registro')) || `REG-${finalId}`;
          const finalQt = String(getRowValue(row, 'qt') !== undefined ? getRowValue(row, 'qt') : '1')?.trim();
          const contaContabil = literalText(getRowValue(row, 'contacontabil', 'conta_contabil')) || 'SEM CONTA';
          const statusVal = literalText(getRowValue(row, 'status')) || 'Pendente';
          // A planilha é a fonte da conferência: o texto `status` («CONFERIDO…»)
          // e a coluna de auditoria dizem a mesma coisa, e quem lê é a regra única.
          const conferidoNaPlanilha = statusVal.toLowerCase().includes('conferido');

          const serialVal = literalText(getRowValue(row, 'serial', 'serial_number'));
          const dataaqVal = normalizeDateISO(getRowValue(row, 'dataaqusic', 'dataaquisic'));
          const cnpjVal = literalText(getRowValue(row, 'cnpj'));
          const fornecedorVal = literalText(getRowValue(row, 'nomefornecedor', 'fornecedor'));
          const nfVal = literalText(getRowValue(row, 'notafiscal'));
          const finalEndereco = literalText(getRowValue(row, 'endereco', 'end', 'localizacao', 'localização', 'localidade', 'physicallocalization', 'loc', 'local', 'sala', 'posicao', 'posição'));
          const subregVal = literalText(getRowValue(row, 'subreg'));
          const databaixaVal = normalizeDateISO(getRowValue(row, 'databaixa'));
          const centrodecustoVal = literalText(getRowValue(row, 'centrodecusto', 'centro_custo'));

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
            etiqueta: etiquetaLiteral,
            tag: etiquetaLiteral,
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
            // Cópia literal da linha inteira (inclui datas e valores como escritos).
            _sourceRow: sourceRowLiteral(row as Record<string, unknown>),
            source_primarykey: sourcePrimarykey,
            source_row: i + chunkIndex + 1,
            import_batch: importBatch,
            ...marcarAlteracaoLocal(),
            _is_deleted: 0,
            _conferido: isConferido({
              _conferido: conferidoNaPlanilha,
              AUDITOR_STATUS_CONFERENCIA: getRowValue(row as Record<string, unknown>, 'AUDITOR_STATUS_CONFERENCIA')
            }) ? 1 : 0,
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

        assetsToInsert.forEach((asset) => carregadas.push({
          tenantid: asset.tenantid,
          filial: asset.filial_raw || asset.filial,
          primarykey: asset.primarykey,
          source_primarykey: asset.source_primarykey ?? null
        }));

        // DESCARGA NO ARMAZENAMENTO LOCAL (Transação ACID atômica com Fail-Fast)
        try {
          await db.transaction('rw', [db.local_assets, db.ativos, db.audit_logs], async () => {
            // Validação estrita antes da gravação
            for (const asset of assetsToInsert) {
              if (!asset.id || !asset.primarykey) {
                throw new Error("Violência de chave de integridade: Chave primária nula ou vazia.");
              }
            }

            await db.local_assets.bulkPut(assetsToInsert);
            await db.ativos.bulkPut(assetsToInsert);

            // Gravação dos logs de correção
            for (const corr of correctionsToLog) {
              await gravarAuditoria({
                usuario: activeEmail,
                acao: 'CORRECTION_VLR_INIT_ZERO',
                tabela: 'ativos',
                registro_id: corr.id,
                details: `Saneamento de valor de aquisição corrompido para '0' na importação Excel. Valor original: ${corr.originalValue}`,
                delta: JSON.stringify({ valorOriginal: corr.originalValue })
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

    await DatabaseLoaderService.verifyLoadedRows(carregadas);
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

export async function verifyAndRestorePhysicalBackup(): Promise<boolean> {
  try {
    const fileContent = await Filesystem.readFile({
      path: 'GBR_KARDEK_DATA/local_assets_secure.dat',
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    });

    if (fileContent.data) {
      const restoredAssets = JSON.parse(fileContent.data as string);
      // Só invalida quando há mesmo restauro: este caminho corre em todo boot.
      await invalidateTenantCaseMarker();
      // Alimenta atomicamente o Dexie.js para restabelecer os 12.636 ativos sem Race Conditions
      await db.transaction('rw', [db.local_assets], async () => {
        await db.local_assets.clear();
        await db.local_assets.bulkAdd(restoredAssets);
      });
      return true;
    }
  } catch {
    // Arquivo ainda não criado no primeiro boot limpo (Comportamento Esperado)
  }
  return false;
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
