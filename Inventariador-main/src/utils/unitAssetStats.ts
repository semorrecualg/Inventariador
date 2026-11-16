import { normalizeKey } from './schema';
import { unitContextKey } from './unitContextUtils';

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
  /** Contrato da unidade (`''` = linha legada sem contrato). */
  tenantid: string;
  total: number;
  checked: number;
}

export interface UnitCounter {
  /** Conta um ativo na unidade da sua (contrato, filial). */
  count: (filialRaw: unknown, conferido: unknown, tenantid?: string) => void;
  /** Registra um rótulo conhecido (props/GPS) sem contar ativo nenhum. */
  addLabel: (filialRaw: unknown, tenantid?: string) => void;
  entries: () => UnitAssetCount[];
}

const toTenant = (raw: unknown): string =>
  raw === null || raw === undefined ? '' : String(raw).toUpperCase().trim();

const toLabel = (raw: unknown): string => (raw === null || raw === undefined ? '' : String(raw));

const isChecked = (conferido: unknown): boolean =>
  conferido === 1 || conferido === '1' || conferido === true;

export function createUnitCounter(): UnitCounter {
  const counts = new Map<string, UnitAssetCount>();

  const ensure = (label: string, tenantid: string): UnitAssetCount | null => {
    const key = normalizeKey(label);
    if (!key) return null;
    const composite = unitContextKey(tenantid, key);
    let entry = counts.get(composite);
    if (!entry) {
      entry = { label, tenantid, total: 0, checked: 0 };
      counts.set(composite, entry);
    }
    return entry;
  };

  return {
    count(filialRaw, conferido, tenantid) {
      const entry = ensure(toLabel(filialRaw), toTenant(tenantid));
      if (!entry) return;
      entry.total += 1;
      if (isChecked(conferido)) entry.checked += 1;
    },
    addLabel(filialRaw, tenantid) {
      ensure(toLabel(filialRaw), toTenant(tenantid));
    },
    entries() {
      return Array.from(counts.values());
    },
  };
}

/**
 * Unidades sem contrato passam para o único contrato da base.
 *
 * A sessão pode não trazer `tenantid` (modo INTERNAL sem contrato resolvido) e
 * as linhas legadas também não: sem esta normalização nasciam dois cartões para
 * a mesma filial e a entrada do contrato ficava a zero. Com mais de um contrato
 * na base não há adivinhação — a unidade «sem contrato» mantém-se.
 */
export function normalizeLegacyTenants(
  entries: UnitAssetCount[],
  preferredTenant = ''
): UnitAssetCount[] {
  const tenants = new Set(entries.map((e) => e.tenantid).filter(Boolean));
  const preferred = toTenant(preferredTenant);
  const only = preferred || (tenants.size === 1 ? Array.from(tenants)[0] : '');
  if (!only) return entries;
  const merged = new Map<string, UnitAssetCount>();
  for (const entry of entries) {
    const tenantid = entry.tenantid || only;
    const key = unitContextKey(tenantid, normalizeKey(entry.label));
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...entry, tenantid });
    } else {
      current.total += entry.total;
      current.checked += entry.checked;
    }
  }
  return Array.from(merged.values());
}

/**
 * Remove cartões fantasma: unidade sem ativos cuja filial já tem ativos noutro
 * contrato. Uma filial sem dados que só existe na lista de permissões continua —
 * só cai a cópia vazia da mesma filial («SEM CONTRATO» ou contrato errado).
 */
export function dropGhostUnits(entries: UnitAssetCount[]): UnitAssetCount[] {
  const withData = new Set(
    entries.filter((e) => e.total > 0).map((e) => normalizeKey(e.label))
  );
  if (withData.size === 0) return entries;
  return entries.filter(
    (e) => e.total > 0 || e.checked > 0 || !withData.has(normalizeKey(e.label))
  );
}
