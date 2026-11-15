/**
 * Log de eventos de campo (`field_events`) — F1 da malha de auditoria.
 *
 * Um evento é uma afirmação imutável sobre o que aconteceu no aparelho: quem,
 * onde, quando e o quê. O estado do ativo passa a ser **projetado** a partir
 * destes eventos (ver `src/services/fieldProjection.ts`), nunca escrito à mão.
 *
 * A tabela é só-adição: `event_id` é a chave, e update/delete são recusados pelo
 * próprio banco (ver hooks em `sqliteService`).
 */

export type FieldEventType =
  | 'LEITURA'
  | 'DIVERGENCIA'
  | 'ETIQUETA'
  | 'FOTO'
  | 'ASSINATURA'
  | 'POSSE'
  | 'CORRECAO';

/** Conteúdo específico do tipo; campos conhecidos + extras tolerados. */
export interface FieldEventPayload {
  /** Local onde o ativo foi encontrado (`_localMaster`). */
  local?: string;
  status?: string;
  gps_lat?: number | null;
  gps_lng?: number | null;
  foto?: string | null;
  etiqueta?: string;
  /** `CORRECAO`: campo alterado e os dois valores. */
  campo?: string;
  antes?: unknown;
  depois?: unknown;
  [extra: string]: unknown;
}

/**
 * Evento posto de parte: a nuvem recusou-o por colidir na chave única
 * `(tenantid, device_id, lamport)` e reenviá-lo em cada ciclo só gasta rede.
 *
 * Guarda o evento COMPLETO, não um resumo: quem for corrigir a causa precisa do
 * que foi recusado, e um registo de quarentena que não permite reconstruir o
 * evento é só um aviso.
 */
export interface QuarantinedFieldEvent {
  event_id: string;
  tenantid: string;
  filial: string;
  asset_key?: string;
  lamport: number;
  event_type: FieldEventType;
  occurred_at: string;
  reason: string;
  quarantined_at: string;
  event: FieldEvent;
}

export interface FieldEvent {
  /** UUID gerado no aparelho — a chave de idempotência do sync. */
  event_id: string;
  tenantid: string;
  filial: string;
  device_id: string;
  auditor: string;
  event_type: FieldEventType;
  territory_key?: string;
  asset_key?: string;
  /** Contador lógico do aparelho; entra na ordem determinística. */
  lamport: number;
  /** Hora do aparelho — informação e detecção de fraude, não ordenação. */
  occurred_at: string;
  /** Hora do servidor, quando o evento voltou da nuvem. */
  received_at?: string;
  payload: FieldEventPayload;
  /** Cadeia de hash por aparelho (F1.6). */
  prev_hash?: string;
  hash?: string;
  /** 0 = só no aparelho; 1 = já confirmado pela nuvem. */
  _synced: 0 | 1;
}

/** O que o chamador fornece: `event_id`, `lamport` e marcação são do store. */
export type FieldEventInput = Omit<FieldEvent, 'event_id' | 'lamport' | 'received_at' | '_synced'> & {
  event_id?: string;
  lamport?: number;
};
