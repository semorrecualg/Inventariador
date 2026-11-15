// ============================================================================
// configScope — QUE CONFIGURAÇÃO PERTENCE A QUEM (fonte única)
// ----------------------------------------------------------------------------
// Antes esta regra vivia em três sítios que podiam divergir:
//   • o whitelist de `buildConfigCloudPayload` (o que sobe para a nuvem);
//   • a lista de preferências de `utils/fieldPreferences` (o que fica no aparelho);
//   • o strip aplicado ao snapshot gravado em cache.
//
// Aqui há UMA declaração. O payload da nuvem, o mapeamento de volta, o strip do
// snapshot e os testes derivam todos destas duas listas:
//
//   CONTRACT_CONFIG_COLUMNS  →  configuração do CONTRATO (viaja entre aparelhos)
//   DEVICE_CONFIG_KEYS       →  configuração do DISPOSITIVO (nunca viaja)
//
// Regra de bolso: se muda por aparelho (tema, som, câmara, modo de base local),
// é dispositivo; se descreve o contrato (campos editáveis, regras de foto,
// integração Protheus), é contrato.
// ============================================================================

/**
 * Chaves de `InventoryState` que pertencem ao DISPOSITIVO.
 *
 * `scannerMode`, `autoConfirmOnScan` e `scanFeedbackMode` descrevem a leitura
 * naquele aparelho; `darkMode` e `batterySaver` são conforto/energia locais.
 * Fonte de persistência delas: `utils/fieldPreferences` (localStorage).
 */
export const DEVICE_CONFIG_KEYS = [
  'scannerMode',
  'autoConfirmOnScan',
  'scanFeedbackMode',
  'darkMode',
  'batterySaver',
  // Mudam por aparelho e não podem ser impostos por outro:
  //  • inventorySearchMode/immersiveMode: como este operador procura e vê o ecrã;
  //  • databaseMode: INTERNAL (base no aparelho) vs SUPABASE não é decisão do contrato.
  'inventorySearchMode',
  'immersiveMode',
  'databaseMode'
] as const;

export type DeviceConfigKey = (typeof DEVICE_CONFIG_KEYS)[number];

/**
 * Chaves de `InventoryState` que pertencem ao CONTRATO, com o nome da coluna em
 * `inventory_config`. Só estas podem subir para a nuvem.
 */
export const CONTRACT_CONFIG_COLUMNS = {
  companies: 'companies',
  lastUpdated: 'last_updated',
  status: 'status',
  editableFields: 'editable_fields',
  qrCodeFields: 'qr_code_fields',
  protheusIntegrationEnabled: 'protheus_integration_enabled',
  protheusApiUrl: 'protheus_api_url',
  mandatoryPhotoOnDivergence: 'mandatory_photo_on_divergence',
  mandatoryPhotoOnNewItem: 'mandatory_photo_on_new_item'
} as const;

export type ContractConfigKey = keyof typeof CONTRACT_CONFIG_COLUMNS;

/** Colunas (snake_case) aceitas na linha de `inventory_config`. */
export const CONTRACT_CONFIG_COLUMN_SET: ReadonlySet<string> = new Set(
  Object.values(CONTRACT_CONFIG_COLUMNS)
);

/** Coluna → chave de estado, para reconstruir a config que desce da nuvem. */
export const CONTRACT_REVERSE_COLUMNS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(CONTRACT_CONFIG_COLUMNS).map(([stateKey, column]) => [column, stateKey])
);

/** Variantes snake_case das preferências de dispositivo (linhas antigas da nuvem). */
export const DEVICE_CONFIG_COLUMNS: ReadonlySet<string> = new Set([
  'scanner_mode',
  'auto_confirm_on_scan',
  'scan_feedback_mode',
  'dark_mode',
  'battery_saver',
  'inventory_search_mode',
  'immersive_mode',
  'database_mode'
]);

export const DEVICE_CONFIG_KEY_SET: ReadonlySet<string> = new Set(DEVICE_CONFIG_KEYS);

/**
 * Preferências de dispositivo guardadas em `utils/fieldPreferences` (localStorage).
 * `databaseMode` fica de fora: o modo de base tem ciclo de vida próprio e é
 * persistido em `app_database_mode` — duplicá-lo aqui recriaria duas verdades.
 */
export const DEVICE_PREFERENCE_KEYS = DEVICE_CONFIG_KEYS.filter(
  (key) => key !== 'databaseMode'
) as Exclude<(typeof DEVICE_CONFIG_KEYS)[number], 'databaseMode'>[];
