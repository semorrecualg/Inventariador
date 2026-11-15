/**
 * Conferência de campo → evento → projeção (F1.3/F1.4).
 *
 * A tela de conferência deixa de escrever `_conferido`, `_dataLeitura`,
 * `_auditor`, `_localMaster` e GPS à mão. Em vez disso:
 *
 *   1. emite `LEITURA` ou `DIVERGENCIA` com `lamport`, GPS e aparelho;
 *   2. projeta o estado a partir dos eventos do ativo (ordem determinística);
 *   3. grava os campos derivados nas tabelas de estado (`local_assets` e os
 *      espelhos que ainda existem até F5).
 *
 * O evento é a fonte da verdade; o estado é consequência. Se a projeção for
 * repetida, o resultado é o mesmo — não há contador a "andar para trás".
 */
import { db } from './sqliteService';
import { getDeviceId } from './syncSessionService';
import { TagInventario } from '../types';
import { appendFieldEvent, eventsForAsset } from './fieldEventStore';
import { projectAsset, type ProjectedAsset } from './fieldProjection';
import type { FieldEvent, FieldEventPayload } from '../types/fieldEvent';

export type TipoConferencia = 'LEITURA' | 'DIVERGENCIA';

export interface ConferenciaInput {
  tenantid: string;
  filial: string;
  /** Chave de origem do ativo (`primarykey`). */
  asset_key: string;
  auditor: string;
  tipo: TipoConferencia;
  local?: string;
  gps_lat?: number | null;
  gps_lng?: number | null;
  occurred_at?: string;
  /** Injetáveis nos testes; em produção vêm do aparelho e do contador local. */
  device_id?: string;
  lamport?: number;
}

export interface ConferenciaResultado {
  event: FieldEvent;
  estado: ProjectedAsset;
}

/**
 * Identificador do aparelho — o MESMO do recibo de sincronização.
 *
 * Antes havia dois: um em `localStorage` para os eventos e outro no store do
 * sync. Dois nomes para o mesmo telemóvel estragam a rastreabilidade (o recibo
 * dizia um aparelho, a trilha de eventos outro). Quem manda é `getDeviceId`.
 */
export const resolveDeviceId = (): Promise<string> => getDeviceId();

/**
 * Contador lógico do aparelho: guardado em `SYSTEM_CONTEXT` para ser monotónico
 * entre reinícios; se o registo faltar (restore antigo), reconstruí-lo a partir
 * do próprio log evita reutilizar números já usados.
 */
export const nextDeviceLamport = async (deviceId: string): Promise<number> => {
  const key = `field_lamport_${deviceId}`;
  const contexto = await db.SYSTEM_CONTEXT.get(key);
  const doContexto = Number(contexto?.value ?? 0) || 0;

  let doLog = 0;
  if (!contexto) {
    const todos = await db.field_events.toArray();
    doLog = todos.reduce(
      (max, event) => (event.device_id === deviceId ? Math.max(max, Number(event.lamport) || 0) : max),
      0
    );
  }

  const proximo = Math.max(doContexto, doLog) + 1;
  await db.SYSTEM_CONTEXT.put({ key, value: String(proximo), updated_at: new Date().toISOString() });
  return proximo;
};

/** Campos que a projeção governa no estado do ativo. */
export const derivarAtualizacaoConferencia = (
  estado: ProjectedAsset
): Record<string, unknown> => {
  const patch: Record<string, unknown> = {
    _conferido: estado._conferido,
    _versionEventos: estado._version,
  };
  if (estado._auditor !== undefined) patch._auditor = estado._auditor;
  if (estado._dataLeitura !== undefined) patch._dataLeitura = estado._dataLeitura;
  if (estado._localMaster !== undefined) patch._localMaster = estado._localMaster;
  if (estado.gps_lat !== undefined) patch.gps_lat = estado.gps_lat;
  if (estado.gps_lng !== undefined) patch.gps_lng = estado.gps_lng;
  // Tag sempre reescrita: sem isto, um ativo que ficou `DIVERGÊNCIA` continuava
  // marcado como divergente depois de uma leitura normal.
  patch.TAG_INVENTARIO = estado._divergencia
    ? TagInventario.DIVERGENCIA
    : TagInventario.CONFERIDO;
  return patch;
};

/**
 * Regista a conferência de um ativo e devolve o estado projetado.
 *
 * É o único caminho de escrita de conferência: a tela chama isto e usa
 * `derivarAtualizacaoConferencia(estado)` no objeto que mostra/guarda.
 */
export const conferirAtivo = async (input: ConferenciaInput): Promise<ConferenciaResultado> => {
  const deviceId = input.device_id || (await resolveDeviceId());
  const lamport = input.lamport ?? (await nextDeviceLamport(deviceId));
  const payload: FieldEventPayload = {
    local: input.local,
    gps_lat: input.gps_lat ?? null,
    gps_lng: input.gps_lng ?? null,
  };

  const event = await appendFieldEvent({
    tenantid: input.tenantid,
    filial: input.filial,
    device_id: deviceId,
    auditor: input.auditor,
    event_type: input.tipo,
    asset_key: input.asset_key,
    lamport,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    payload,
  });

  const estado = projectAsset(await eventsForAsset(input.tenantid, input.asset_key));
  if (!estado) {
    // Só acontece se o evento não for lido de volta (base em erro): falhar alto.
    throw new Error('[FieldProjection] Evento gravado mas projeção vazia.');
  }

  // NÃO se grava aqui: quem persiste o ativo é o commit único da tela
  // (`commitAssetUpdate`), já com este patch — gravar também aqui duplicava a
  // escrita da mesma linha.
  return { event, estado };
};
