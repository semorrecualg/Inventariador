/**
 * Projetor puro do log de eventos de campo (F1.2).
 *
 * `estado(ativo) = reduzir(eventos do ativo, por ordem determinística)`
 * e a ordem é `(lamport, device_id, event_id)` — nunca a hora do aparelho, que
 * pode estar errada. Por isso o mesmo conjunto de eventos produz o mesmo estado
 * em qualquer ordem de chegada: celular e servidor usam este mesmo código.
 *
 * Sem I/O, sem Dexie, sem relógio: entra lista de eventos, sai estado.
 */
import type { FieldEvent } from '../types/fieldEvent';

export interface ProjectedAsset {
  tenantid: string;
  asset_key: string;
  /** Lido e aceite (LEITURA) — `DIVERGENCIA` também conta como lido. */
  _conferido: boolean;
  /** Lido num local diferente do esperado. */
  _divergencia: boolean;
  _auditor?: string;
  _dataLeitura?: string;
  _localMaster?: string;
  gps_lat?: number | null;
  gps_lng?: number | null;
  _etiqueta?: string;
  _foto?: string | null;
  /** `CORRECAO` aplicadas em ordem: campo → último valor aceite. */
  _correcoes: Record<string, unknown>;
  /** Quantos eventos foram aplicados — um buraco na sequência fica visível. */
  _version: number;
  _ultimoEventoId?: string;
}

/** Chave estável do ativo dentro do contrato: `TENANT|asset_key`. */
export const projectionKey = (event: Pick<FieldEvent, 'tenantid' | 'asset_key'>): string =>
  `${String(event.tenantid || '').trim().toUpperCase()}|${String(event.asset_key || '').trim()}`;

/**
 * Ordem determinística: `lamport`, depois `device_id`, depois `event_id`.
 * O desempate por aparelho e por id garante que dois eventos com o mesmo
 * contador (aparelhos diferentes) não troquem de posição entre execuções.
 */
export const compareFieldEvents = (a: FieldEvent, b: FieldEvent): number => {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.device_id !== b.device_id) return a.device_id < b.device_id ? -1 : 1;
  if (a.event_id !== b.event_id) return a.event_id < b.event_id ? -1 : 1;
  return 0;
};

const estadoVazio = (tenantid: string, assetKey: string): ProjectedAsset => ({
  tenantid,
  asset_key: assetKey,
  _conferido: false,
  _divergencia: false,
  _correcoes: {},
  _version: 0,
});

/** Aplica um evento ao estado. Função pura: devolve um estado novo. */
export const applyFieldEvent = (state: ProjectedAsset, event: FieldEvent): ProjectedAsset => {
  const next: ProjectedAsset = { ...state, _correcoes: { ...state._correcoes } };
  const payload = event.payload ?? {};

  switch (event.event_type) {
    case 'LEITURA':
    case 'DIVERGENCIA':
      next._conferido = true;
      next._divergencia = event.event_type === 'DIVERGENCIA';
      next._auditor = event.auditor;
      next._dataLeitura = event.occurred_at;
      if (payload.local !== undefined) next._localMaster = payload.local;
      if (payload.gps_lat !== undefined) next.gps_lat = payload.gps_lat;
      if (payload.gps_lng !== undefined) next.gps_lng = payload.gps_lng;
      break;
    case 'ETIQUETA':
      if (payload.etiqueta !== undefined) next._etiqueta = payload.etiqueta;
      break;
    case 'FOTO':
      if (payload.foto !== undefined) next._foto = payload.foto;
      break;
    case 'CORRECAO':
      if (payload.campo) next._correcoes[payload.campo] = payload.depois;
      break;
    case 'ASSINATURA':
    case 'POSSE':
      // Não alteram o estado do ativo (POSSE é de território).
      break;
  }

  next._version = state._version + 1;
  next._ultimoEventoId = event.event_id;
  return next;
};

/**
 * Projeta o estado de um ativo a partir dos eventos dele (de qualquer ordem de
 * entrada). Devolve `null` quando não há eventos de ativo.
 */
export const projectAsset = (events: FieldEvent[]): ProjectedAsset | null => {
  const doAtivo = events.filter(e => e.asset_key).sort(compareFieldEvents);
  if (doAtivo.length === 0) return null;
  const { tenantid, asset_key } = doAtivo[0];
  return doAtivo.reduce(
    (state, event) => applyFieldEvent(state, event),
    estadoVazio(String(tenantid || '').trim().toUpperCase(), String(asset_key || '').trim())
  );
};

/** Projeta todos os ativos presentes na lista, ordenado por chave (estável). */
export const projectFieldEvents = (events: FieldEvent[]): ProjectedAsset[] => {
  const porAtivo = new Map<string, FieldEvent[]>();
  for (const event of events) {
    if (!event.asset_key) continue;
    const key = projectionKey(event);
    const atual = porAtivo.get(key);
    if (atual) atual.push(event);
    else porAtivo.set(key, [event]);
  }
  return [...porAtivo.keys()].sort().map(key => projectAsset(porAtivo.get(key)!)!)
    .filter((estado): estado is ProjectedAsset => estado !== null);
};

/**
 * Buracos na sequência de um aparelho: `lamport` que salta.
 *
 * É o que `_version` denuncia — se o celular aplicou 7 eventos e o servidor tem
 * 9, faltam dois. Devolve os números ausentes (limitado, para não explodir).
 */
export const sequenceGaps = (events: FieldEvent[], limit: number = 100): number[] => {
  const porAparelho = new Map<string, Set<number>>();
  for (const event of events) {
    const set = porAparelho.get(event.device_id) ?? new Set<number>();
    set.add(event.lamport);
    porAparelho.set(event.device_id, set);
  }
  const gaps: number[] = [];
  for (const lampions of porAparelho.values()) {
    const ordenados = [...lampions].sort((a, b) => a - b);
    for (let i = 1; i < ordenados.length && gaps.length < limit; i++) {
      for (let faltando = ordenados[i - 1] + 1; faltando < ordenados[i] && gaps.length < limit; faltando++) {
        gaps.push(faltando);
      }
    }
  }
  return gaps;
};
