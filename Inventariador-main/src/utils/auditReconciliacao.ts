/**
 * RECONCILIAÇÃO DA TRILHA DE ATIVOS (F2, 3.º passo)
 * ============================================================================
 * A aba «Ativos» da Trilha lê três fontes que descrevem os mesmos factos:
 *
 * 1. `audit_logs` do aparelho (Dexie) — todos os eventos gerados aqui,
 *    incluindo os que ainda não subiram (`_synced = 0`).
 * 2. `audit_logs` da nuvem — o arquivo durável da fila da F2, com
 *    `client_event_id` = id local. É a única fonte que sobrevive a uma
 *    desinstalação.
 * 3. `asset_logs` da nuvem — linhas escritas por trigger nas alterações que
 *    chegaram à base, sem id local (histórico anterior à F2).
 *
 * Antes, a união usava só conteúdo (data|ação|utilizador|registo|detalhes) e
 * ignorava o arquivo: o mesmo evento podia aparecer duas vezes quando as duas
 * fontes tinham detalhes diferentes, e um aparelho reinstalado deixava de ver
 * os eventos que a fila já tinha arquivado.
 *
 * A reconciliação dá prioridade à identidade (`client_event_id` ↔ id local),
 * cai para o conteúdo só quando não há identidade, e marca cada linha com a
 * origem e se está confirmada na nuvem — sem inventar: o que não está no
 * arquivo diz «só aparelho».
 */
import { textoDoDetails } from './auditDetails';

/** Evento mínimo aceite pelas três fontes. */
export interface EventoTrilha {
  id?: string;
  client_event_id?: string | null;
  timestamp?: string | null;
  created_at?: string | null;
  user_email?: string | null;
  action?: string | null;
  table_name?: string | null;
  record_id?: string | null;
  details?: unknown;
  _synced?: number | null;
  origin?: string | null;
}

export type OrigemTrilha = 'APP' | 'NUVEM';

export interface EventoReconciliado extends EventoTrilha {
  /** Chave estável para a lista (o id local ou o uuid da nuvem). */
  id: string;
  origem: OrigemTrilha;
  confirmadoNaNuvem: boolean;
}

const quando = (e: EventoTrilha): string => String(e.timestamp || e.created_at || '');

/**
 * Identidade de conteúdo: o mesmo evento tem ids diferentes no Dexie e no
 * Postgres, por isso a comparação é pelo que ele diz.
 */
export const chaveDoConteudo = (e: EventoTrilha): string =>
  [
    quando(e).slice(0, 19),
    String(e.action || '').toUpperCase(),
    String(e.user_email || ''),
    String(e.record_id || ''),
    textoDoDetails(e.details),
  ].join('|');

/**
 * Une as três fontes sem repetir eventos:
 * - o arquivo da nuvem entra primeiro (é a prova de que o evento subiu);
 * - `asset_logs` entra a seguir e só fica se não houver par por conteúdo;
 * - o aparelho entra por último e, quando encontra o seu par, só acrescenta o
 *   carimbo de «confirmado» — a linha do aparelho é a que tem `_synced`.
 */
export const reconciliarTrilha = (
  locais: EventoTrilha[],
  arquivoNuvem: EventoTrilha[],
  assetLogsNuvem: EventoTrilha[] = []
): EventoReconciliado[] => {
  const porChave = new Map<string, EventoReconciliado>();
  const porIdentidade = new Map<string, EventoReconciliado>();
  const todos: EventoReconciliado[] = [];

  const adicionar = (
    evento: EventoTrilha,
    origem: OrigemTrilha,
    confirmado: boolean
  ): EventoReconciliado => {
    const chave = chaveDoConteudo(evento);
    const identidade = String(evento.client_event_id || evento.id || '');
    const existente =
      (identidade ? porIdentidade.get(identidade) : undefined) || porChave.get(chave);

    if (existente) {
      if (confirmado) existente.confirmadoNaNuvem = true;
      if (!existente.client_event_id && evento.client_event_id) {
        existente.client_event_id = evento.client_event_id;
      }
      if (origem === 'APP' && existente.origem === 'NUVEM') {
        // O evento do aparelho é a versão rica do mesmo facto (detalhes em
        // texto, `new_data` do app): fica com o rótulo APP, mas continua
        // confirmado, porque a linha de trigger prova que chegou à nuvem.
        Object.assign(existente, evento, { origem: 'APP', confirmadoNaNuvem: true });
      }
      // A chave de conteúdo do local também passa a apontar para a linha única,
      // para não voltar a entrar por outro caminho (ex.: trigger com o mesmo
      // conteúdo do evento arquivado).
      porChave.set(chave, existente);
      if (identidade) porIdentidade.set(identidade, existente);
      return existente;
    }

    const linha: EventoReconciliado = {
      ...evento,
      id: identidade || chave,
      origem,
      confirmadoNaNuvem: confirmado,
    };
    porChave.set(chave, linha);
    if (identidade) porIdentidade.set(identidade, linha);
    todos.push(linha);
    return linha;
  };

  for (const evento of arquivoNuvem) adicionar(evento, 'APP', true);
  for (const evento of assetLogsNuvem) adicionar(evento, 'NUVEM', true);
  for (const evento of locais) {
    // `_synced = 1` significa que a fila já confirmou esta linha; se ela não
    // aparecer no arquivo lido (limite da consulta), continua confirmada.
    adicionar(evento, 'APP', evento._synced === 1);
  }

  return todos.sort((a, b) => quando(b).localeCompare(quando(a)));
};
