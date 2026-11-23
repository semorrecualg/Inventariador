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
 * A reconciliação dá prioridade à identidade (`client_event_id` ↔ id local) e
 * usa o conteúdo apenas como ponte entre fontes diferentes: o arquivo liga-se
 * ao aparelho, `asset_logs` liga-se ao app. Duas linhas da mesma fonte com ids
 * próprios distintos são dois eventos, mesmo que o conteúdo coincida — no mesmo
 * segundo, sem `record_id` e com os mesmos detalhes, dois cliques têm conteúdo
 * igual mas são factos diferentes. Cada linha leva a origem e se está
 * confirmada na nuvem — sem inventar: o que não está no arquivo diz «só
 * aparelho».
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

/** De onde a linha veio: o conteúdo só liga fontes diferentes. */
type FonteTrilha = 'ARQUIVO' | 'ASSET_LOGS' | 'APARELHO';

/** Uma linha aceite e as fontes que ela já representa. */
interface Candidato {
  linha: EventoReconciliado;
  fontes: Set<FonteTrilha>;
}

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
  const porChave = new Map<string, Candidato[]>();
  const porIdentidade = new Map<string, Candidato>();
  const todos: EventoReconciliado[] = [];

  const adicionar = (
    evento: EventoTrilha,
    confirmado: boolean,
    fonte: FonteTrilha
  ): EventoReconciliado => {
    const chave = chaveDoConteudo(evento);
    const identidade = String(evento.client_event_id || evento.id || '');
    const origem: OrigemTrilha = fonte === 'ASSET_LOGS' ? 'NUVEM' : 'APP';
    // Identidade primeiro. O conteúdo é só uma ponte entre fontes diferentes,
    // e cada linha representa cada fonte uma vez: dois eventos no mesmo segundo
    // emparelham um-a-um com as cópias da outra fonte em vez de colapsarem.
    const candidato =
      (identidade ? porIdentidade.get(identidade) : undefined) ||
      (porChave.get(chave) || []).find((c) => !c.fontes.has(fonte));

    if (candidato) {
      const { linha } = candidato;
      if (confirmado) linha.confirmadoNaNuvem = true;
      if (!linha.client_event_id && evento.client_event_id) {
        linha.client_event_id = evento.client_event_id;
      }
      if (origem === 'APP' && linha.origem === 'NUVEM') {
        // O evento do aparelho é a versão rica do mesmo facto (detalhes em
        // texto, `new_data` do app): fica com o rótulo APP, mas continua
        // confirmado, porque a linha de trigger prova que chegou à nuvem.
        Object.assign(linha, evento, { origem: 'APP', confirmadoNaNuvem: true });
      }
      // A chave de conteúdo do local também passa a apontar para a linha única,
      // para não voltar a entrar por outro caminho (ex.: trigger com o mesmo
      // conteúdo do evento arquivado).
      candidato.fontes.add(fonte);
      const daChave = porChave.get(chave);
      if (daChave) {
        if (!daChave.includes(candidato)) daChave.push(candidato);
      } else {
        porChave.set(chave, [candidato]);
      }
      if (identidade) porIdentidade.set(identidade, candidato);
      return linha;
    }

    const linha: EventoReconciliado = {
      ...evento,
      id: identidade || chave,
      origem,
      confirmadoNaNuvem: confirmado,
    };
    const novo: Candidato = { linha, fontes: new Set([fonte]) };
    const daChave = porChave.get(chave);
    if (daChave) daChave.push(novo);
    else porChave.set(chave, [novo]);
    if (identidade) porIdentidade.set(identidade, novo);
    todos.push(linha);
    return linha;
  };

  for (const evento of arquivoNuvem) adicionar(evento, true, 'ARQUIVO');
  for (const evento of assetLogsNuvem) adicionar(evento, true, 'ASSET_LOGS');
  for (const evento of locais) {
    // `_synced = 1` significa que a fila já confirmou esta linha; se ela não
    // aparecer no arquivo lido (limite da consulta), continua confirmada.
    adicionar(evento, evento._synced === 1, 'APARELHO');
  }

  return todos.sort((a, b) => quando(b).localeCompare(quando(a)));
};
