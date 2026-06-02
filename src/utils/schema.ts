
/**
 * SCHEMA.TS - Centralização de Mapeamento de Planilhas e Banco de Dados
 * Versão: v24.50.6 (GBR KARDEK)
 */

import { SCHEMA_PRIORITY, TYPE_LABELS } from '../constants/schema';
import { Asset } from '../types';

export { SCHEMA_PRIORITY, TYPE_LABELS };

/**
 * Normaliza o cabeçalho para comparação (Uppercase, Trim)
 * Garante que 'unidade_operacional' === 'UNIDADE_OPERACIONAL'
 */
export const normalizeHeader = (header: string | null | undefined): string => {
  if (!header) return '';
  return header.toString().trim().toUpperCase().replace(/\s/g, '_');
};

/**
 * Normaliza uma chave (Unidade, Etiqueta, etc) para comparação robusta.
 * Versão v25.01: Trata '-', '_' e acentos para máxima resiliência de vinculação.
 */
export const normalizeKey = (s: unknown): string => {
  if (s === null || s === undefined) return '';
  const str = String(s);
  if (!str) return '';
  
  return str.toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .trim()
    .replace(/[_-]/g, ' ') // Trata underscores e hifens como espaços
    .replace(/\s+/g, ' ');  // Colapsa múltiplos espaços
};

/**
 * Compara de forma resiliente duas chaves de Unidade Operacional.
 * Aceita correspondências exatas, por código do início (ex: "010101" com "010101 CICOPAL GO")
 * ou por contenção mútua resiliente.
 */
export const matchUnitKeys = (keyA: string, keyB: string): boolean => {
  const normA = normalizeKey(keyA);
  const normB = normalizeKey(keyB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  
  // Extrai prefixos numéricos (ex: "010101" de "010101 CICOPAL GO")
  const numA = normA.match(/^\d+/)?.[0];
  const numB = normB.match(/^\d+/)?.[0];
  if (numA && numB && numA === numB) return true;

  // Se um dos códigos sem zeros bater com o outro
  if (numA && numB) {
    if (parseInt(numA, 10) === parseInt(numB, 10)) return true;
  }
  
  // Suporte a correspondência por contenção (LIKE) para acomodação de strings mais longas
  // Excluindo 'CICOPAL' de forma estrita de proximidades para evitar colapso incorreto de dados do grupo/tenant
  if ((normA.includes(normB) || normB.includes(normA)) && 
      normA !== 'CICOPAL' && normB !== 'CICOPAL' && 
      !normA.includes('CICOPAL') && !normB.includes('CICOPAL')) {
    const minLen = Math.min(normA.length, normB.length);
    if (minLen >= 4) return true;
  }
  
  return false;
};

/**
 * Encontra a melhor coluna disponível em um objeto (row) ou array de chaves com base na prioridade.
 * Implementa a estratégia de "Best Match" para resiliência de schema.
 */
export function findBestColumn(keys: string[], priorities: string[]): string | null {
  const normalizedKeys = keys.map(k => normalizeHeader(k));
  
  for (const priority of priorities) {
    const normalizedPriority = normalizeHeader(priority);
    const index = normalizedKeys.indexOf(normalizedPriority);
    if (index !== -1) {
      return keys[index]; // Retorna o nome original da chave encontrada
    }
  }
  
  return null;
}

/**
 * Obtém o valor de um ativo tentando as chaves prioritárias
 */
export function getAssetValueByPriority(asset: Asset | Record<string, unknown>, priorities: string[]): unknown {
  if (!asset) return null;
  const bestKey = findBestColumn(Object.keys(asset), priorities);
  return bestKey ? (asset as Record<string, unknown>)[bestKey] : null;
}

/**
 * Helper para extrair a unidade operacional de um ativo de forma soberana
 */
export function getAssetUnit(asset: Asset | Record<string, unknown>): string {
  if (asset && (asset as Record<string, unknown>).filial) {
    return String((asset as Record<string, unknown>).filial).trim().toUpperCase();
  }
  const val = getAssetValueByPriority(asset, SCHEMA_PRIORITY.UNIT);
  return (val || '').toString().trim().toUpperCase() || 'UNIT_UNDEFINED';
}

/**
 * Normaliza um objeto ativo para o contrato unificado de campos GBR v2.6.
 * Mapeamentos prioritários:
 * - GRUPO_EMPRESARIAL, tenant_id, group_id -> tenantId
 * - UNIDADE_OPERACIONAL, _unitid, unit_id, filial_id -> filial
 */
export function normalizeAssetContract(asset: Asset | Record<string, unknown> | null | undefined): Asset {
  if (!asset) return asset as unknown as Asset;
  
  const originalAsset = asset as Record<string, unknown>;
  
  // UNIFIED SIGNATURE ASSIGNMENTS:
  const tenantId = (
    originalAsset.tenantId ||
    originalAsset._tenantid ||
    originalAsset.GRUPO_EMPRESARIAL ||
    originalAsset.tenant_id ||
    originalAsset.group_id ||
    'CICOPAL'
  ).toString().trim();
  
  const filial = (
    originalAsset.filial ||
    originalAsset.UNIDADE_OPERACIONAL ||
    originalAsset._unitid ||
    originalAsset.unit_id ||
    originalAsset.filial_id ||
    'MATRIZ'
  ).toString().trim();

  const status = (
    originalAsset.status ||
    originalAsset.STATUS ||
    originalAsset.TAG_INVENTARIO ||
    'PENDENTE'
  ).toString().trim();

  const etiqueta = (
    asset.etiqueta ||
    asset.ETIQUETA ||
    ''
  ).toString().trim();

  const qt = asset.qt !== undefined ? asset.qt : (asset.QT !== undefined ? asset.QT : 1);

  const descricaodoativo = (
    asset.descricaodoativo ||
    asset.DESCRICAODOATIVO ||
    asset.descricao ||
    asset.DESCRICAODOBEM ||
    ''
  ).toString().trim();

  const serial = (
    asset.serial ||
    asset.SERIAL ||
    ''
  ).toString().trim();

  const dataaqusic = (
    asset.dataaqusic ||
    asset.DATAAQUISIC ||
    asset.DATAAQUSIC ||
    ''
  ).toString().trim();

  const cnpj = (
    asset.cnpj ||
    asset.CNPJ ||
    ''
  ).toString().trim();

  const nomefornecedor = (
    asset.nomefornecedor ||
    asset.NOMEFORNECEDOR ||
    ''
  ).toString().trim();

  const notafiscal = (
    asset.notafiscal ||
    asset.NOTAFISCAL ||
    ''
  ).toString().trim();

  const endereco = (
    asset.endereco ||
    asset.ENDERECO ||
    ''
  ).toString().trim();

  const registro = (
    asset.registro ||
    asset.REGISTRO ||
    ''
  ).toString().trim();

  const subreg = (
    asset.subreg ||
    asset.SUBREG ||
    ''
  ).toString().trim();

  const databaixa = (
    asset.databaixa ||
    asset.DATABAIXA ||
    ''
  ).toString().trim();

  const contacontabil = (
    asset.contacontabil ||
    asset.conta_contabil ||
    asset.CONTACONTABIL ||
    asset.CONTA_CONTABIL ||
    ''
  ).toString().trim();

  const primarykey = (
    asset.primarykey ||
    asset.PRIMARYKEY ||
    ''
  ).toString().trim();

  const centrodecusto = (
    asset.centrodecusto ||
    asset.CENTRODECUSTO ||
    ''
  ).toString().trim();

  const vlraquisic = asset.vlraquisic !== undefined ? asset.vlraquisic : (asset.VLRAQUISIC !== undefined ? asset.VLRAQUISIC : 0);

  const sn1_recno = asset.sn1_recno !== undefined ? Number(asset.sn1_recno) : (asset.Sn1_recno !== undefined ? Number(asset.Sn1_recno) : null);
  const sn3_recno = asset.sn3_recno !== undefined ? Number(asset.sn3_recno) : (asset.Sn3_recno !== undefined ? Number(asset.Sn3_recno) : null);

  // Extend asset object with target property mappings (mutates)
  asset.tenantId = tenantId;
  asset.filial = filial;
  asset.status = status;
  asset.etiqueta = etiqueta;
  asset.qt = qt;
  asset.descricaodoativo = descricaodoativo;
  asset.serial = serial;
  asset.dataaqusic = dataaqusic;
  asset.cnpj = cnpj;
  asset.nomefornecedor = nomefornecedor;
  asset.notafiscal = notafiscal;
  asset.endereco = endereco;
  asset.registro = registro;
  asset.subreg = subreg;
  asset.databaixa = databaixa;
  asset.contacontabil = contacontabil;
  asset.primarykey = primarykey;
  asset.centrodecusto = centrodecusto;
  asset.vlraquisic = vlraquisic;
  asset.sn1_recno = sn1_recno;
  asset.sn3_recno = sn3_recno;

  // Sync fallbacks for existing code
  asset._tenantid = tenantId;
  asset._unitid = filial;
  asset.GRUPO_EMPRESARIAL = tenantId;
  asset.UNIDADE_OPERACIONAL = filial;
  asset.STATUS = status;
  asset.ETIQUETA = etiqueta;
  asset.QT = qt;
  asset.DESCRICAODOATIVO = descricaodoativo;
  asset.SERIAL = serial;
  asset.DATAAQUISIC = dataaqusic;
  asset.CNPJ = cnpj;
  asset.NOMEFORNECEDOR = nomefornecedor;
  asset.NOTAFISCAL = notafiscal;
  asset.ENDERECO = endereco;
  asset.REGISTRO = registro;
  asset.SUBREG = subreg;
  asset.DATABAIXA = databaixa;
  asset.conta_contabil = contacontabil;
  asset.PRIMARYKEY = primarykey;
  asset.CENTRODECUSTO = centrodecusto;
  asset.VLRAQUISIC = vlraquisic;
  asset.Sn1_recno = sn1_recno;
  asset.Sn3_recno = sn3_recno;

  return asset as Asset;
}

/**
 * Mapping of internal types to user-friendly labels (Already exported from constants/schema)
 */
