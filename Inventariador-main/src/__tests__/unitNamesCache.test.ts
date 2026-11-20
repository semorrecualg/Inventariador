// ============================================================================
// unitNamesCache.test.ts — o cache da lista de filiais (localStorage) só serve
// para o MESMO utilizador e contrato, e só dentro do prazo: a lista de outra
// conta/contrato não pode abrir o CONTRATO com as filiais erradas.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  UNIT_NAMES_CACHE_TTL_MS,
  readUnitNamesCache,
  unitListScope,
  unitNamesCacheKey,
  writeUnitNamesCache
} from '../utils/unitContextUtils';

const ESCOPO = unitListScope('semorr@gmail.com', 'CICOPAL');
const AGORA = Date.parse('2026-11-20T12:00:00Z');

describe('cache da lista de filiais por escopo', () => {
  it('guarda e devolve os nomes normalizados do mesmo escopo', () => {
    const bruto = writeUnitNamesCache(ESCOPO, [' 010201 snacks pa ', '010101 CICOPAL GO'], AGORA);

    const lido = readUnitNamesCache(bruto, ESCOPO, AGORA + 1000);

    expect(lido?.names).toEqual(['010101 CICOPAL GO', '010201 SNACKS PA']);
    expect(lido?.savedAt).toBe(AGORA);
  });

  it('a chave separa conta e contrato', () => {
    expect(unitNamesCacheKey(ESCOPO)).not.toBe(
      unitNamesCacheKey(unitListScope('outro@x.com', 'CICOPAL'))
    );
    expect(unitNamesCacheKey(ESCOPO)).not.toBe(
      unitNamesCacheKey(unitListScope('semorr@gmail.com', 'CLIENTETESTE'))
    );
  });

  it('cache de outro escopo é descartada', () => {
    const bruto = writeUnitNamesCache(ESCOPO, ['010101 CICOPAL GO'], AGORA);

    expect(readUnitNamesCache(bruto, unitListScope('semorr@gmail.com', 'CLIENTETESTE'), AGORA)).toBeNull();
    expect(readUnitNamesCache(bruto, unitListScope('outro@x.com', 'CICOPAL'), AGORA)).toBeNull();
    expect(readUnitNamesCache(bruto, unitListScope(null, null), AGORA)).toBeNull();
  });

  it('passado um dia deixa de servir', () => {
    const bruto = writeUnitNamesCache(ESCOPO, ['010101 CICOPAL GO'], AGORA);

    expect(readUnitNamesCache(bruto, ESCOPO, AGORA + UNIT_NAMES_CACHE_TTL_MS)).not.toBeNull();
    expect(readUnitNamesCache(bruto, ESCOPO, AGORA + UNIT_NAMES_CACHE_TTL_MS + 1)).toBeNull();
  });

  it('carimbo no futuro (relógio errado) não serve', () => {
    const bruto = writeUnitNamesCache(ESCOPO, ['010101 CICOPAL GO'], AGORA + 60_000);

    expect(readUnitNamesCache(bruto, ESCOPO, AGORA)).toBeNull();
  });

  it('lixo, lista vazia ou nomes que não são texto não servem', () => {
    expect(readUnitNamesCache(null, ESCOPO, AGORA)).toBeNull();
    expect(readUnitNamesCache('{', ESCOPO, AGORA)).toBeNull();
    expect(readUnitNamesCache('[]', ESCOPO, AGORA)).toBeNull();
    expect(readUnitNamesCache(JSON.stringify({ scope: ESCOPO, names: [], savedAt: AGORA }), ESCOPO, AGORA)).toBeNull();
    expect(readUnitNamesCache(JSON.stringify({ scope: ESCOPO, names: [1], savedAt: AGORA }), ESCOPO, AGORA)).toBeNull();
    expect(readUnitNamesCache(JSON.stringify({ scope: ESCOPO, names: ['X'], savedAt: 'ontem' }), ESCOPO, AGORA)).toBeNull();
    // só sentinelas: não é lista de filiais
    expect(readUnitNamesCache(JSON.stringify({ scope: ESCOPO, names: ['TODAS', ' '], savedAt: AGORA }), ESCOPO, AGORA)).toBeNull();
  });
});
