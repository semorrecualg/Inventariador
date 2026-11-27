// @vitest-environment jsdom
// src/__tests__/systemLock.test.ts
// ============================================================================
// BLINDAGEM FÍSICA — UMA CHAVE, DOIS SENTIDOS (H1 · Fase 3)
//
// `is_system_locked` estava lida à mão em cinco sítios do `App`, e só fechava a
// SUBIDA (e por via do modo forçado a INTERNAL no arranque). A DESCIDA ficava
// aberta: o realtime aplicava a linha da nuvem ao estado e ao disco a cada
// evento, mesmo com o aparelho blindado. Aqui fixa-se a grafia da chave e que
// os três caminhos de rede (subida, descida, realtime) a consultam.
// ============================================================================
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSystemLocked, SYSTEM_LOCK_KEY } from '../utils/systemLock';

const leitor = (valor: string | null) => ({
  getItem: (chave: string) => (chave === SYSTEM_LOCK_KEY ? valor : null),
});

describe('isSystemLocked — a grafia não muda de versão para versão', () => {
  it('só o valor exato `true` fecha o sistema', () => {
    expect(isSystemLocked(leitor('true'))).toBe(true);
  });

  it.each([null, '', 'false', '1', 'TRUE', 'sim'])('o valor %s é sistema aberto', (valor) => {
    expect(isSystemLocked(leitor(valor))).toBe(false);
  });

  it('sem armazenamento disponível não se afirma blindagem', () => {
    expect(isSystemLocked(null)).toBe(false);
  });

  it('lê a mesma chave que o Gestor de Base grava', () => {
    expect(SYSTEM_LOCK_KEY).toBe('is_system_locked');
  });
});

describe('blindagem — a chave é consultada em todos os caminhos de rede', () => {
  const fonte = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

  it('a subida fecha no portão único (fila, fotos, campanhas, trilha e envio em massa)', () => {
    const push = fonte('services/pushGate.ts');
    expect(push).toContain('!isSystemLocked()');
    expect(push).toContain('Capacitor.isNativePlatform()');
  });

  it('a descida do App consulta a chave pela regra única', () => {
    const app = fonte('App.tsx');
    expect(app).toContain('const isDbLocked = isSystemLocked();');
    // A comparação à mão saiu de todos os sítios: a regra vive num módulo só.
    expect(app).not.toContain("localStorage.getItem('is_system_locked')");
  });

  it('o realtime não aplica a nuvem com o sistema blindado, evento a evento', () => {
    const app = fonte('App.tsx');
    expect(app).toContain('Evento em tempo real ignorado: sistema blindado');
    expect(app).toContain('if (isSystemLocked()) return;');
  });
});

describe('blindagem — a chave é lida no dispositivo, não no módulo', () => {
  afterEach(() => {
    localStorage.removeItem(SYSTEM_LOCK_KEY);
  });

  it('a leitura acompanha a escrita do Gestor de Base em tempo de execução', () => {
    expect(isSystemLocked()).toBe(false);
    localStorage.setItem(SYSTEM_LOCK_KEY, 'true');
    expect(isSystemLocked()).toBe(true);
    localStorage.removeItem(SYSTEM_LOCK_KEY);
    expect(isSystemLocked()).toBe(false);
  });
});
