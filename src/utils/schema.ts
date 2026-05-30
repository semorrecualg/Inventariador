
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
  if (normA.includes(normB) || normB.includes(normA)) {
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
  const val = getAssetValueByPriority(asset, SCHEMA_PRIORITY.UNIT);
  return (val || '').toString().trim().toUpperCase() || 'UNIT_UNDEFINED';
}

/**
 * Mapping of internal types to user-friendly labels (Already exported from constants/schema)
 */
