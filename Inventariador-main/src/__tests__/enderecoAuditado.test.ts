// ============================================================================
// enderecoAuditado.test.ts — o «DE → PARA» do endereço é uma regra só.
//
// A exportação do App comparava o endereço por `normalizeKey` e a do painel
// (`GBR_AUDIT`) por `===`; o bloco «Fluxo de Adoção» do cartão e do Kardex
// usava `_localMaster !== endereco` cru. O mesmo ativo saía «COM ALTERAÇÃO»
// num ficheiro e «SEM ALTERAÇÃO» no outro, e um local escrito com outra caixa
// ou hífen abria um fluxo de adoção que não existiu. A regra passa a viver em
// `src/utils/assetAddress.ts` e as quatro pontas chamam-na.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mesmoEnderecoAuditado, rotuloDePara } from '../utils/assetAddress';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));
const fonte = (rel: string): string => readFileSync(join(srcRoot, rel), 'utf8');

/** Código sem comentários: um comentário pode citar o padrão antigo. */
const semComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('mesmoEnderecoAuditado — grafias do mesmo local', () => {
  it('ignora caixa, acentos, hífen/underscore e espaços repetidos', () => {
    expect(mesmoEnderecoAuditado({ endereco: 'ALMOX  CENTRAL', _localMaster: 'almox central' })).toBe(true);
    expect(mesmoEnderecoAuditado({ endereco: 'A-01', _localMaster: 'a_01' })).toBe(true);
    expect(mesmoEnderecoAuditado({ endereco: 'JOSÉ', _localMaster: 'jose' })).toBe(true);
  });

  it('locais de facto diferentes continuam diferentes', () => {
    expect(mesmoEnderecoAuditado({ endereco: 'A-01', _localMaster: 'A-02' })).toBe(false);
    expect(mesmoEnderecoAuditado({ endereco: 'ALMOX CENTRAL', _localMaster: 'ALMOX NORTE' })).toBe(false);
  });

  it('sem local auditado não há mudança a mostrar', () => {
    expect(mesmoEnderecoAuditado({ endereco: 'A-01' })).toBe(true);
    expect(mesmoEnderecoAuditado({})).toBe(true);
  });
});

describe('rotuloDePara — o que a planilha de auditoria leva', () => {
  it('o DE_PARA já registado vence a derivação', () => {
    expect(rotuloDePara({ DE_PARA: 'COM ALTERAÇÃO', endereco: 'A-01', _localMaster: 'A-01' }, true))
      .toBe('COM ALTERAÇÃO');
    expect(rotuloDePara({ DE_PARA: 'SEM ALTERAÇÃO', endereco: 'A-01', _localMaster: 'A-02' }, false))
      .toBe('SEM ALTERAÇÃO');
  });

  it('item por conferir é PENDENTE, mesmo com local diferente', () => {
    expect(rotuloDePara({ endereco: 'A-01', _localMaster: 'A-02' }, false)).toBe('PENDENTE');
  });

  it('conferido no mesmo local (noutra grafia) é SEM ALTERAÇÃO', () => {
    expect(rotuloDePara({ endereco: 'A-01', _localMaster: 'a_01' }, true)).toBe('SEM ALTERAÇÃO');
    expect(rotuloDePara({ endereco: 'A-01' }, true)).toBe('SEM ALTERAÇÃO');
  });

  it('conferido noutro local é COM ALTERAÇÃO', () => {
    expect(rotuloDePara({ endereco: 'A-01', _localMaster: 'A-02' }, true)).toBe('COM ALTERAÇÃO');
  });
});

describe('as pontas chamam a regra única', () => {
  it('as duas exportações usam `rotuloDePara`', () => {
    for (const rel of ['App.tsx', 'components/Dashboard.tsx']) {
      const bloco = semComentarios(fonte(rel));
      expect(bloco, `${rel} deixou de usar o rótulo único`).toContain('rotuloDePara(a, conferido)');
      expect(bloco, `${rel} voltou a comparar o endereço à mão`).not.toMatch(
        /AUDITOR_DE_PARA'\]\s*=\s*[^;\n]*===\s*[^;\n]*(?:_localMaster|endereco)/
      );
    }
  });

  it('o cartão do ativo e o Kardex usam `mesmoEnderecoAuditado`', () => {
    for (const rel of ['components/AssetDetail.tsx', 'components/PublicKardex.tsx']) {
      const bloco = fonte(rel);
      expect(bloco, `${rel} deixou de usar a regra do endereço`).toContain('mesmoEnderecoAuditado(');
      expect(bloco, `${rel} voltou a comparar _localMaster com endereco à mão`).not.toMatch(
        /_localMaster\s*(?:!==|===|==|!=)\s*[^.]+\.endereco/
      );
    }
  });
});
