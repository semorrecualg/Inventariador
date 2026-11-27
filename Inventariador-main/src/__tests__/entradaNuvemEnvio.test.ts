// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { motivoDoBloqueioDoEnvioEmMassa } from '../utils/entradaNuvemEnvio';

describe('motivoDoBloqueioDoEnvioEmMassa', () => {
  it('sem credenciais do build (BASE LOCAL) bloqueia, mesmo online e com sessão', () => {
    expect(motivoDoBloqueioDoEnvioEmMassa({ isInternalMode: true, online: true, estadoSessao: 'autenticada' })).toBe('sem-credenciais');
  });

  it('sem credenciais vence o offline', () => {
    expect(motivoDoBloqueioDoEnvioEmMassa({ isInternalMode: true, online: false, estadoSessao: 'ausente' })).toBe('sem-credenciais');
  });

  it('offline bloqueia quando há credenciais', () => {
    expect(motivoDoBloqueioDoEnvioEmMassa({ isInternalMode: false, online: false, estadoSessao: 'autenticada' })).toBe('offline');
  });

  it('sem sessão pede credencial (não bloqueia por outro motivo)', () => {
    expect(motivoDoBloqueioDoEnvioEmMassa({ isInternalMode: false, online: true, estadoSessao: 'ausente' })).toBe('sem-sessao');
  });

  it('sessão autenticada deixa enviar', () => {
    expect(motivoDoBloqueioDoEnvioEmMassa({ isInternalMode: false, online: true, estadoSessao: 'autenticada' })).toBeNull();
  });

  it('sessão indeterminada deixa enviar (o portão não bloqueia por não conseguir perguntar)', () => {
    expect(motivoDoBloqueioDoEnvioEmMassa({ isInternalMode: false, online: true, estadoSessao: 'indeterminado' })).toBeNull();
  });

  it('aceita temCredenciaisDoBuild (invertido)', () => {
    expect(motivoDoBloqueioDoEnvioEmMassa({ temCredenciaisDoBuild: false, online: true, estadoSessao: 'autenticada' })).toBe('sem-credenciais');
    expect(motivoDoBloqueioDoEnvioEmMassa({ temCredenciaisDoBuild: true, online: true, estadoSessao: 'autenticada' })).toBeNull();
  });

  it('aceita modoBase textual', () => {
    expect(motivoDoBloqueioDoEnvioEmMassa({ modoBase: 'INTERNAL', online: true, estadoSessao: 'autenticada' })).toBe('sem-credenciais');
  });

  it('aceita chamada posicional (isInternal, online, estado)', () => {
    expect(motivoDoBloqueioDoEnvioEmMassa(false, true, 'ausente')).toBe('sem-sessao');
    expect(motivoDoBloqueioDoEnvioEmMassa(true, true, 'autenticada')).toBe('sem-credenciais');
  });
});