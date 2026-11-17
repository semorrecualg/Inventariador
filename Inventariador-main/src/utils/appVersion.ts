import pkg from '../../package.json';

/**
 * VERSIONADOR DO APP — fonte única da versão que aparece nas telas.
 *
 * O número vive num só lugar (`Inventariador-main/package.json`, governança § 3)
 * e é o mesmo que o APK (`android-build.yml`) e o protocolo do SRE usam. Nenhuma
 * tela deve escrever uma versão à mão: quem mostra a versão importa daqui, para
 * que um bump no `package.json` atualize tudo de uma vez, sem cópia paralela.
 */
export const APP_VERSION = String(pkg?.version ?? 'desconhecida').trim() || 'desconhecida';

/** Etiqueta padrão das telas: `v2.8.0`. */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;

/** Selo curto com a marca do produto: `GBR v2.8.0`. */
export const APP_VERSION_STAMP = `GBR ${APP_VERSION_LABEL}`;
