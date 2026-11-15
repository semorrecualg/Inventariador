// @vitest-environment jsdom
// ============================================================================
// sreMonitor.test.ts — [App]/[Sync] chegam ao SRE Monitor sem consola.
//
// Sem isto, validar um login Supabase exigia o DevTools aberto: as linhas
// `[App] Login detectado` / `>>> [Sync] Dados recebidos da nuvem` só existiam
// no console. O Gestor de Base assina este buffer e mostra-as no ecrã.
// ============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  assinarLinhasSre,
  interessaAoSreMonitor,
  lerLinhasSre,
  limparLinhasSre,
  publicarLinhaSre,
  LIMITE_LINHAS_SRE
} from '../services/sreMonitor';
import { logger } from '../utils/logger';

describe('sreMonitor', () => {
  beforeEach(() => {
    limparLinhasSre();
  });

  it('filtra pelos prefixos que o operador precisa', () => {
    expect(interessaAoSreMonitor('[App] Login detectado.')).toBe(true);
    expect(interessaAoSreMonitor('>>> [Sync] Dados recebidos da nuvem: 12 ativos.')).toBe(true);
    expect(interessaAoSreMonitor('[SRE_CLOUD] Enviando 500 ativos')).toBe(true);
    expect(interessaAoSreMonitor('[Supabase] Conexão OK')).toBe(false);
    expect(interessaAoSreMonitor('texto solto')).toBe(false);
  });

  it('guarda a linha com hora e mensagem', () => {
    publicarLinhaSre(['>>> [Sync] Dados recebidos da nuvem: 7 ativos.']);

    const linhas = lerLinhasSre();

    expect(linhas).toHaveLength(1);
    expect(linhas[0].mensagem).toContain('Dados recebidos da nuvem: 7 ativos');
    expect(linhas[0].hora).toMatch(/\d{1,2}:\d{2}/);
  });

  it('entrega ao ouvinte e pára quando a assinatura é cancelada', () => {
    const recebidas: string[] = [];
    const cancelar = assinarLinhasSre((linha) => recebidas.push(linha.mensagem));

    publicarLinhaSre(['[App] Login detectado.']);
    cancelar();
    publicarLinhaSre(['[App] Depois de cancelar.']);

    expect(recebidas).toHaveLength(1);
    expect(recebidas[0]).toContain('[App] Login detectado');
    expect(lerLinhasSre()).toHaveLength(2);
  });

  it('descarta o que não interessa ao monitor', () => {
    publicarLinhaSre(['[Supabase] ruído']);
    publicarLinhaSre(['']);

    expect(lerLinhasSre()).toEqual([]);
  });

  it('não cresce sem limite', () => {
    for (let i = 0; i < LIMITE_LINHAS_SRE + 10; i++) {
      publicarLinhaSre([`[Sync] linha ${i}`]);
    }

    const linhas = lerLinhasSre();

    expect(linhas).toHaveLength(LIMITE_LINHAS_SRE);
    expect(linhas[0].mensagem).toContain('linha 10');
    expect(linhas[linhas.length - 1].mensagem).toContain(`linha ${LIMITE_LINHAS_SRE + 9}`);
  });

  it('não repete a mesma linha consecutiva nem ruído de render', () => {
    publicarLinhaSre(['[App] GPS Configs: 1, Units with GPS: MATRIZ']);
    publicarLinhaSre(['[App] GPS Configs: 1, Units with GPS: MATRIZ']);
    publicarLinhaSre(['>>> [Sync] Dados recebidos da nuvem: 5 ativos.']);
    publicarLinhaSre(['>>> [Sync] Dados recebidos da nuvem: 5 ativos.']);
    publicarLinhaSre(['>>> [Sync] Dados recebidos da nuvem: 6 ativos.']);

    expect(lerLinhasSre().map((l) => l.mensagem)).toEqual([
      '>>> [Sync] Dados recebidos da nuvem: 5 ativos.',
      '>>> [Sync] Dados recebidos da nuvem: 6 ativos.'
    ]);
  });

  it('formata objectos e erros sem estourar', () => {
    const erro = new Error('falha de rede');
    publicarLinhaSre(['[Sync] erro:', erro, { tentativa: 2 }]);

    const [linha] = lerLinhasSre();

    expect(linha.mensagem).toContain('falha de rede');
    expect(linha.mensagem).toContain('tentativa');
  });

  it('o logger alimenta o monitor (ponte real)', () => {
    logger.info('>>> [Sync] Dados recebidos da nuvem: 3 ativos.');
    logger.info('[Supabase] esta não interessa');

    const linhas = lerLinhasSre();

    expect(linhas).toHaveLength(1);
    expect(linhas[0].mensagem).toContain('Dados recebidos da nuvem: 3 ativos');
  });
});
