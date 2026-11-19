import { describe, it, expect } from 'vitest';
import pkg from '../../package.json';
import { APP_VERSION, APP_VERSION_LABEL, APP_VERSION_STAMP } from '../utils/appVersion';

/**
 * O versionador existe para não haver cópia da versão no código: tudo o que a
 * tela mostra tem de sair do `package.json`.
 */
describe('appVersion — fonte única da versão exibida', () => {
  it('lê a versão do package.json, sem número paralelo', () => {
    expect(APP_VERSION).toBe(String(pkg.version));
  });

  it('a etiqueta e o selo seguem o formato padrão das telas', () => {
    expect(APP_VERSION_LABEL).toBe(`v${pkg.version}`);
    expect(APP_VERSION_STAMP).toBe(`GBR v${pkg.version}`);
  });

  it('nunca devolve vazio (tela sem versão confunde o suporte)', () => {
    expect(APP_VERSION).not.toBe('');
    expect(APP_VERSION_LABEL).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
