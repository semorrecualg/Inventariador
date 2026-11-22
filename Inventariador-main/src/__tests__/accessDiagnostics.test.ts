// ============================================================================
// accessDiagnostics.test.ts — as regras do DIAGNÓSTICO DE ACESSO: de onde vêm as
// filiais (base local → nuvem → cache → nenhuma) e o texto que o dono copia para
// pedir suporte. É a pergunta que custou o incidente: «as filiais vêm de onde?».
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  buildAccessDiagnostic,
  decideFiliaisOrigem,
  formatHoraDaConsulta,
  minutosDesde,
  sessaoPersistidaNasChaves,
  type AccessDiagnosticInput
} from '../utils/accessDiagnostics';

const BASE: AccessDiagnosticInput = {
  contrato: 'cicopal',
  modo: 'SUPABASE',
  contextos: 5,
  filiaisNaBase: false,
  filiaisDaNuvem: 0,
  filiaisDaCache: 0,
  unidadesComAncora: 5,
  unidadesComCampanha: 1,
  ativosLocais: 0,
  nomesConsultadosEm: null,
  ultimoErroDeRede: null,
  agora: new Date(2026, 10, 20, 13, 42, 0).getTime()
};

describe('decideFiliaisOrigem — de onde vêm as filiais', () => {
  it('sem base, sem nuvem e sem cache: nenhuma (o caso que fecha o CONTRATO)', () => {
    expect(decideFiliaisOrigem(BASE)).toBe('nenhuma');
  });

  it('a lista da nuvem conta quando a base não responde pelo contrato', () => {
    expect(decideFiliaisOrigem({ ...BASE, filiaisDaNuvem: 5 })).toBe('lista da nuvem');
  });

  it('o cache serve quando não há nuvem nem base', () => {
    expect(decideFiliaisOrigem({ ...BASE, filiaisDaCache: 5 })).toBe('cache');
  });

  it('a base local manda sobre nuvem e cache', () => {
    expect(
      decideFiliaisOrigem({ ...BASE, filiaisNaBase: true, filiaisDaNuvem: 5, filiaisDaCache: 5 })
    ).toBe('base local');
  });
});

describe('buildAccessDiagnostic — o texto que o dono copia', () => {
  it('com base vazia e lista da nuvem, diz «lista da nuvem» e a hora da consulta', () => {
    const consulta = new Date(2026, 10, 20, 13, 42, 0).getTime();
    const diag = buildAccessDiagnostic({
      ...BASE,
      filiaisDaNuvem: 5,
      nomesConsultadosEm: consulta,
      agora: consulta + 2 * 60000
    });

    expect(diag.origem).toBe('lista da nuvem');
    expect(diag.texto).toContain('Contrato: CICOPAL');
    expect(diag.texto).toContain('Modo: SUPABASE');
    expect(diag.texto).toContain('Sessão: não persistida (recarregar volta ao login)');
    expect(diag.texto).toContain('Filiais: lista da nuvem (5)');
    expect(diag.texto).toContain('Nomes consultados: 13:42 (há 2 min)');
    expect(diag.texto).toContain('Último erro de rede: nenhum');
    expect(diag.texto.startsWith('GBR KARDEK · diagnóstico de acesso')).toBe(true);
  });

  it('em modo INTERNAL com base local, diz «base local» e não promete nuvem', () => {
    const diag = buildAccessDiagnostic({
      ...BASE,
      modo: 'INTERNAL',
      filiaisNaBase: true,
      ativosLocais: 12636
    });

    expect(diag.origem).toBe('base local');
    expect(diag.texto).toContain('Modo: INTERNAL');
    expect(diag.texto).toContain('Filiais: base local (5)');
    expect(diag.texto).toContain('Ativos no aparelho: 12636');
    expect(diag.texto).toContain('Nomes consultados: nunca nesta sessão');
  });

  it('mostra as linhas a mais e separa mesma primarykey de primarykeys diferentes', () => {
    const diag = buildAccessDiagnostic({
      ...BASE,
      ativosLocais: 12636,
      linhasNoAparelho: 25272,
      ativosRepetidos: {
        grupos: 1,
        mesmaChave: 0,
        chavesDiferentes: 1,
        exemplos: [
          {
            identidade: '010101 CICOPAL GO · 005046',
            linhas: 2,
            chaves: ['0000002345', '005046']
          }
        ]
      }
    });

    expect(diag.texto).toContain('Ativos no aparelho: 12636');
    expect(diag.texto).toContain('Linhas lidas: 25272 (12636 a mais que os ativos)');
    expect(diag.texto).toContain('Ativos repetidos: 1 grupo(s) · mesma primarykey: 0 · primarykeys diferentes: 1');
    expect(diag.texto).toContain('Repetido · 010101 CICOPAL GO · 005046: 2 linha(s) · 0000002345, 005046');
  });

  it('sem contrato, sem filiais e com erro de rede: mostra os três sinais', () => {
    const diag = buildAccessDiagnostic({
      ...BASE,
      contrato: '   ',
      contextos: 0,
      unidadesComAncora: 0,
      unidadesComCampanha: 0,
      ultimoErroDeRede: 'Failed to fetch (unit_configs)'
    });

    expect(diag.origem).toBe('nenhuma');
    expect(diag.texto).toContain('Contrato: SEM CONTRATO');
    expect(diag.texto).toContain('Filiais: nenhuma (nem base local, nem nuvem, nem cache)');
    expect(diag.texto).toContain('Último erro de rede: Failed to fetch (unit_configs)');
  });
});

describe('sessaoPersistidaNasChaves — recarregar volta ao login?', () => {
  it('reconhece a chave do supabase-js', () => {
    expect(
      sessaoPersistidaNasChaves(['app_excluded_accounts', 'sb-mpulmonxbcpqjxouzvuc-auth-token'])
    ).toBe(true);
  });

  it('sem chave sb-* (o achado da prova) diz que não há sessão persistida', () => {
    expect(sessaoPersistidaNasChaves(['gbr_unit_names_cache|semorr@gmail.com|CICOPAL'])).toBe(false);
  });

  it('não confunde outras chaves sb- com a sessão', () => {
    expect(sessaoPersistidaNasChaves(['sb-mpulmonxbcpqjxouzvuc-theme'])).toBe(false);
  });
});

describe('formatHoraDaConsulta / minutosDesde', () => {
  it('sem consulta devolve «—» e null', () => {
    expect(formatHoraDaConsulta(null)).toBe('—');
    expect(formatHoraDaConsulta(0)).toBe('—');
    expect(minutosDesde(null)).toBeNull();
  });

  it('carimbo no futuro não inventa minutos negativos', () => {
    const agora = new Date(2026, 10, 20, 12, 0, 0).getTime();
    expect(minutosDesde(agora + 60000, agora)).toBe(0);
  });
});
