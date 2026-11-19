// @vitest-environment jsdom
// Sem o setup (src/test/setup.ts), um Node com webstorage ligado deixa
// `globalThis.localStorage` a apontar para o global do Node, que lança ao ser
// usado sem `--localstorage-file` — e os testes que persistem preferências
// caem. Aqui garante-se que o global é o storage da janela do jsdom.
import { describe, it, expect } from 'vitest';

const janela = (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window;

describe('armazenamento global nos testes', () => {
  it('usa o localStorage e o sessionStorage do jsdom', () => {
    expect(globalThis.localStorage).toBe(janela.localStorage);
    expect(globalThis.sessionStorage).toBe(janela.sessionStorage);

    globalThis.localStorage.setItem('gbr:teste', '1');
    expect(janela.localStorage.getItem('gbr:teste')).toBe('1');
    globalThis.localStorage.removeItem('gbr:teste');
  });
});
