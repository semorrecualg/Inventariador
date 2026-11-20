/**
 * AS RECUSAS DO ENVIO, NUMA LISTA QUE SE PODE LEVAR
 * ============================================================================
 * A aba «Ativos» da trilha já pinta as recusas de envio a vermelho, mas não
 * havia como isolar só essas linhas nem levá-las dali. Um ativo preso em
 * «Pendente Nuvem» obrigava o operador a procurar a causa no meio de toda a
 * conferência do dia.
 *
 * Aqui vivem as três peças da exportação — o filtro, o CSV e o JSON — fora do
 * componente, para poderem ser verificadas sem renderizar a trilha (mesma
 * razão de `utils/auditActions`). As colunas são as que interessam a quem vai
 * ler: `primarykey`, `motivo`, `data`.
 */
import { ehFalhaDeEnvio } from './auditActions';

/** O que a exportação lê de uma linha da trilha (local ou da nuvem). */
export type LinhaDaTrilha = {
  action?: unknown;
  /** A chave de origem, quando a origem a traz no campo próprio. */
  primarykey?: unknown;
  /** Na trilha do app/Postgres a chave chega em `record_id`. */
  record_id?: unknown;
  details?: unknown;
  timestamp?: unknown;
};

/** Uma recusa de envio, já nas três colunas da exportação. */
export type FalhaDeEnvioExportada = {
  primarykey: string;
  motivo: string;
  data: string;
};

/** Só as recusas do envio — a mesma regra dos selos e da retenção. */
export const falhasDeEnvio = <T extends LinhaDaTrilha>(logs: T[]): T[] =>
  logs.filter((log) => ehFalhaDeEnvio(log.action));

/**
 * As linhas da exportação, sem buracos: um registo antigo pode não ter motivo
 * nem chave no campo próprio (a chave fica em `record_id`, a data no
 * `timestamp`). Um campo vazio vira um texto explícito em vez de uma célula
 * em branco que parecia dado perdido.
 */
export const linhasDeFalha = (logs: LinhaDaTrilha[]): FalhaDeEnvioExportada[] =>
  falhasDeEnvio(logs).map((log) => ({
    primarykey: String(log.primarykey ?? log.record_id ?? '').trim() || '—',
    motivo: String(log.details ?? '').trim() || 'sem motivo registado',
    data: String(log.timestamp ?? '').trim(),
  }));

/** Célula CSV citada, com as aspas internas duplicadas. */
const celula = (valor: string): string => `"${valor.replace(/"/g, '""')}"`;

/** Cabeçalho da exportação — os nomes das colunas são o contrato. */
export const COLUNAS_DE_FALHA = ['primarykey', 'motivo', 'data'] as const;

/** CSV das recusas do envio (só as falhas, mesmo que a lista traga mais). */
export const falhasDeEnvioCsv = (logs: LinhaDaTrilha[]): string =>
  [
    COLUNAS_DE_FALHA.join(','),
    ...linhasDeFalha(logs).map((linha) =>
      [celula(linha.primarykey), celula(linha.motivo), celula(linha.data)].join(',')
    ),
  ].join('\n');

/** JSON das recusas do envio — as mesmas três colunas, para integrar. */
export const falhasDeEnvioJson = (logs: LinhaDaTrilha[]): string =>
  JSON.stringify(linhasDeFalha(logs), null, 2);
