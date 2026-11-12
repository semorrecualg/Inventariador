/**
 * FLAGS DE POLÍTICA DA UNIDADE OPERACIONAL
 * ----------------------------------------------------------------------------
 * As regras por filial (`hasGps`, exigir NF, exigir seriado, exigir plaqueta,
 * permitir novo ativo, permitir baixa) existiam só no SQLite/Dexie do aparelho:
 * a tabela `unit_configs` da nuvem não tinha onde as guardar, então trocar de
 * dispositivo mostrava a filial "sem regras".
 *
 * Elas viajam na nuvem dentro de `unit_configs.flags` (jsonb), o mesmo padrão
 * de `inventory_config.data`. Os nomes continuam camelCase porque são os do
 * tipo `UnitConfig` — no Postgres viriam como minúsculas se fossem colunas.
 *
 * Este módulo é puro (sem rede, sem storage) para poder ser testado isolado.
 */

/** Flags que o aparelho pode declarar; `hasGps` é derivada da âncora. */
export const UNIT_FLAG_KEYS = [
  'requireNf',
  'requireSeriado',
  'requirePlaqueta',
  'allowNewAssets',
  'allowWriteOffs'
] as const;

export type UnitFlagKey = (typeof UNIT_FLAG_KEYS)[number];

/** Contrato mínimo lido de um `UnitConfig` (as flags são opcionais). */
export type UnitFlagCarrier = Partial<Record<UnitFlagKey, boolean>> & {
  hasGps?: boolean;
};

/**
 * Flags a gravar para uma unidade.
 *
 * Só entram flags DEFINIDAS no config: um aparelho que não conhece
 * `requireNf` não pode mandar `false` e apagar o que outro configurou. A
 * exceção é `hasGps`, que é sempre calculada — é fato, não preferência.
 */
export function buildUnitFlags(
  config: UnitFlagCarrier,
  hasAnchor: boolean
): Record<string, boolean> {
  const out: Record<string, boolean> = { hasGps: hasAnchor || config.hasGps === true };
  for (const key of UNIT_FLAG_KEYS) {
    const value = config[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/**
 * Filtra o que veio da nuvem: só booleanos das chaves conhecidas. `flags` pode
 * chegar nulo, como objeto ou com lixo de versões antigas.
 */
export function pickUnitFlags(flags: unknown): Record<string, boolean> {
  if (!flags || typeof flags !== 'object') return {};
  const source = flags as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  if (typeof source.hasGps === 'boolean') out.hasGps = source.hasGps;
  for (const key of UNIT_FLAG_KEYS) {
    if (typeof source[key] === 'boolean') out[key] = source[key];
  }
  return out;
}

/**
 * Aplica as flags da nuvem sobre uma config, preservando todos os outros
 * campos (âncora, raio, tenant). Sem flags válidas, devolve a config intacta.
 */
export function mergeUnitFlags<T extends object>(config: T, flags: unknown): T {
  const picked = pickUnitFlags(flags);
  if (Object.keys(picked).length === 0) return config;
  return { ...config, ...picked };
}
