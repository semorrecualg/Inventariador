import { normalizeKey } from './schema';
import { isConferido, type CamposDeConferencia } from './conferencia';
import { uniqueAssetsForDisplay } from './dedupAssets';

/**
 * Contagem de ativos por Unidade Operacional em UMA passagem.
 *
 * Antes, o seletor de unidades carregava todos os ativos da base local para
 * memória e voltava a varrê-los uma vez POR UNIDADE (`nonDeleted.filter(...)`
 * dentro de um `map` das unidades). Com ~50 mil linhas no telemóvel isso é
 * O(n × unidades) — o ecrã ficava minutos em "Carregando Unidades...".
 *
 * Aqui a regra é a mesma de antes (identidade = `normalizeKey(filial)`, rótulo
 * exibido = texto bruto da primeira ocorrência), mas cada ativo é contado uma
 * única vez.
 */
export interface UnitAssetCount {
  /** Rótulo exibido: texto bruto da primeira ocorrência daquela unidade. */
  label: string;
  total: number;
  checked: number;
}

export interface UnitCounter {
  /** Conta um ativo na unidade da sua filial. */
  count: (filialRaw: unknown, asset: CamposDeConferencia) => void;
  /** Registra um rótulo conhecido (props/GPS) sem contar ativo nenhum. */
  addLabel: (filialRaw: unknown) => void;
  entries: () => UnitAssetCount[];
}

const toLabel = (raw: unknown): string => (raw === null || raw === undefined ? '' : String(raw));

/** Campos de uma linha que o contador lê (Dexie, espelho ou recorte de teste). */
type LinhaContavel = {
  primarykey?: unknown;
  tenantid?: unknown;
  filial?: unknown;
  filial_raw?: unknown;
};

/**
 * Alimenta o contador com UMA linha por ativo. A `primarykey` é a identidade do
 * bem: a mesma linha pode estar gravada com o contrato do perfil e sem contrato
 * (carga antiga) e o cartão da filial somava as duas cópias — 12.636 ativos
 * apareciam como 25.272. As linhas sem `primarykey` continuam a contar uma a
 * uma. Nada é apagado da base: a cópia só deixa de contar duas vezes.
 */
export function countUnitAssets<T extends LinhaContavel>(
  rows: T[],
  tenant: string | null | undefined,
  counter: UnitCounter
): void {
  for (const row of uniqueAssetsForDisplay(rows, tenant)) {
    counter.count(row.filial_raw || row.filial, row as unknown as CamposDeConferencia);
  }
}

export function createUnitCounter(): UnitCounter {
  const counts = new Map<string, UnitAssetCount>();

  const ensure = (label: string): UnitAssetCount | null => {
    const key = normalizeKey(label);
    if (!key) return null;
    let entry = counts.get(key);
    if (!entry) {
      entry = { label, total: 0, checked: 0 };
      counts.set(key, entry);
    }
    return entry;
  };

  return {
    count(filialRaw, asset) {
      const entry = ensure(toLabel(filialRaw));
      if (!entry) return;
      entry.total += 1;
      if (isConferido(asset)) entry.checked += 1;
    },
    addLabel(filialRaw) {
      ensure(toLabel(filialRaw));
    },
    entries() {
      return Array.from(counts.values());
    },
  };
}
