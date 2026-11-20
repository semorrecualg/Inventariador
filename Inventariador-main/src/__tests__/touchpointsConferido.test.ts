// ============================================================================
// touchpointsConferido.test.ts — os últimos ecrãs que ainda decidiam sozinhos.
//
// Item 13 da agenda: depois da regra única (`utils/conferencia.ts`) e da
// migração (#142), sobram três sítios que não a usavam:
//
//   1. a ficha PDF do ativo imprimia `_conferidoEm`/`_conferidoPor` — campos
//      que não existem no registo —, pelo que TODOS os cartões saíam
//      «DATA AUDITORIA: PENDENTE» / «AUDITOR: NÃO IDENTIFICADO»;
//   2. a ficha de impressão usava a coluna de auditoria crua e, na falta dela,
//      dizia «Conferência física realizada sem ressalvas» também para itens por
//      conferir;
//   3. o fluxo de aplicar localização gravava `AUDITOR_STATUS_CONFERENCIA =
//      TAG_INVENTARIO`, apagando a prova 'SIM' de quem já conferira o ativo.
//
// O teste fixa a leitura única (`auditoriaDoAtivo`) e o contrato dos ficheiros:
// nenhum volta a decidir pela marca crua nem a inventar conformidade.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditoriaDoAtivo } from '../utils/conferencia';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));
const ficheiro = (rel: string): string => readFileSync(join(srcRoot, rel), 'utf8');

/** Todos os .ts/.tsx de `src/`, sem os testes. */
const ficheirosFonte = (): string[] => {
  const saida: string[] = [];
  const percorrer = (dir: string): void => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        if (nome === '__tests__' || nome === 'node_modules') continue;
        percorrer(caminho);
        continue;
      }
      if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho.slice(srcRoot.length));
    }
  };
  percorrer(srcRoot);
  return saida;
};

/** Linhas de código (fora de comentários) de um texto. */
const linhasDeCodigo = (texto: string): string[] =>
  texto
    .split('\n')
    .filter((linha) => {
      const t = linha.trim();
      return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'));
    });

const LEITURA = '2026-11-19T08:00:00.000Z';

describe('auditoriaDoAtivo — o que a ficha imprime', () => {
  it('item conferido no campo mostra SIM, a data e quem conferiu', () => {
    expect(
      auditoriaDoAtivo({ _conferido: true, _dataLeitura: LEITURA, _auditor: '  Maria Silva ' })
    ).toEqual({
      conferido: true,
      situacao: 'SIM',
      dataLeitura: LEITURA,
      auditor: 'Maria Silva',
    });
  });

  it('conferido pela coluna de auditoria também conta (data ausente, sem invenção)', () => {
    expect(auditoriaDoAtivo({ AUDITOR_STATUS_CONFERENCIA: 'SIM' })).toEqual({
      conferido: true,
      situacao: 'SIM',
      dataLeitura: null,
      auditor: null,
    });
  });

  it('item por conferir não imprime data nem auditor', () => {
    for (const marca of [0, false, undefined, null]) {
      expect(auditoriaDoAtivo({ _conferido: marca, _dataLeitura: LEITURA, _auditor: 'X' })).toEqual({
        conferido: false,
        situacao: 'NÃO',
        dataLeitura: null,
        auditor: null,
      });
    }
    expect(auditoriaDoAtivo(null)).toMatchObject({ conferido: false, situacao: 'NÃO' });
  });

  it('data ilegível e auditor em branco não viram texto inventado', () => {
    expect(
      auditoriaDoAtivo({ _conferido: '1', _dataLeitura: 'sem data', _auditor: '   ' })
    ).toEqual({ conferido: true, situacao: 'SIM', dataLeitura: null, auditor: null });
  });
});

describe('contrato dos ficheiros tocados', () => {
  it('a ficha PDF usa a regra única e não lê campos inexistentes', () => {
    const fonte = ficheiro('utils/reportGenerator.ts');
    expect(fonte).toContain('auditoriaDoAtivo');
    // Os nomes podem aparecer no comentário que explica a correcção; o que não
    // pode voltar é a leitura deles no código.
    const codigo = linhasDeCodigo(fonte).join('\n');
    expect(codigo).not.toContain('_conferidoEm');
    expect(codigo).not.toContain('_conferidoPor');
  });

  it('a ficha de impressão não dá conformidade por omissão', () => {
    const fonte = ficheiro('components/AssetPrintView.tsx');
    expect(fonte).toContain('isConferido(asset)');
    expect(fonte).toMatch(/isConferido\(asset\) \? 'Conferência física realizada sem ressalvas\.'/);
  });

  it('a coluna de auditoria não é sobrescrita pelo rótulo da etiqueta', () => {
    const fonte = ficheiro('App.tsx');
    expect(fonte).not.toContain('AUDITOR_STATUS_CONFERENCIA = updates.TAG_INVENTARIO');
    expect(fonte).toContain("isConferido({ ...a, ...updates }) ? 'SIM' : 'NAO'");
  });

  it('nenhum ficheiro de src/ decide pela marca crua (fora da regra)', () => {
    const padroes = [
      /!{1,2}[A-Za-z0-9_.]*\._conferido\b/,
      /_conferido\s*===\s*(true|1|'1')/,
      /Number\([^)]*_conferido/,
      /AUDITOR_STATUS_CONFERENCIA\s*===\s*'SIM'/,
    ];
    const infratores: string[] = [];
    for (const rel of ficheirosFonte()) {
      if (rel.includes('utils/conferencia.ts')) continue; // a regra é aqui
      for (const linha of linhasDeCodigo(ficheiro(rel))) {
        if (padroes.some((p) => p.test(linha))) infratores.push(`${rel}: ${linha.trim()}`);
      }
    }
    expect(infratores).toEqual([]);
  });
});
