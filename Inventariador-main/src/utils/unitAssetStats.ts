import { normalizeKey } from './schema';

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
  count: (filialRaw: unknown, conferido: unknown) => void;
  /** Registra um rótulo conhecido (props/GPS) sem contar ativo nenhum. */
  addLabel: (filialRaw: unknown) => void;
  entries: () => UnitAssetCount[];
}

const toLabel = (raw: unknown): string => (raw === null || raw === undefined ? '' : String(raw));

const isChecked = (conferido: unknown): boolean =>
  conferido === 1 || conferido === '1' || conferido === true;

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
    count(filialRaw, conferido) {
      const entry = ensure(toLabel(filialRaw));
      if (!entry) return;
      entry.total += 1;
      if (isChecked(conferido)) entry.checked += 1;
    },
    addLabel(filialRaw) {
      ensure(toLabel(filialRaw));
    },
    entries() {
      return Array.from(counts.values());
    },
  };
}
