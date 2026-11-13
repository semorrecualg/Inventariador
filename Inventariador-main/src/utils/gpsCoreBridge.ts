/**
 * Ponte de importação do núcleo de GPS.
 *
 * `gpsCore.ts` é puro (sem navegador). A leitura real do aparelho mora em
 * `gpsUtils.getPreciseFix`. Para que componentes não precisem de dois imports e
 * não criem dependência circular, este arquivo reexporta os dois contratos.
 *
 * @see docs/GPS_ANCORA_E_MAPA_DE_CALOR.md
 */
export * from './gpsCore';
export { getPreciseFix as getPreciseFixGuard } from './gpsUtils';
