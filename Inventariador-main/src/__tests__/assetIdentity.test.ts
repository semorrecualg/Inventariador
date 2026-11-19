// ============================================================================
// assetIdentity.test.ts — IDENTIDADE INTERNA DO ATIVO (Fase 2 da carga).
//
// Regras fixadas:
//   • a coluna `primarykey` da planilha é DADO, não identidade: fica inteira em
//     `source_primarykey`;
//   • duas linhas com a mesma chave de origem recebem identidades distintas — a
//     segunda não substitui a primeira no `bulkPut`;
//   • a identidade é determinística: reimportar o mesmo arquivo recalcula as
//     mesmas chaves (idempotente, sem duplicar);
//   • reordenar as linhas não muda a identidade de nenhuma delas;
//   • contratos diferentes com a mesma chave de origem não colidem.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  createAssetIdentityAllocator,
  newImportBatchId,
  resolveAssetIdentityBase,
  sourcePrimarykeyOf,
  type AssetIdentityCandidate
} from '../utils/assetIdentity';

const LINHA = (
  over: Partial<AssetIdentityCandidate> = {},
  rowOver: Record<string, unknown> = {}
): AssetIdentityCandidate => ({
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  sourcePrimarykey: '008810 CICOPAL',
  etiqueta: '008810 CICOPAL',
  tag: '008810 CICOPAL',
  row: {
    etiqueta: '008810 CICOPAL',
    descricaodoativo: 'CADEIRA GIRATÓRIA',
    serial: 'SN-1',
    registro: 'REG-1',
    ...rowOver
  },
  ...over
});

/** Carga do arquivo inteiro (prime) + alocação linha a linha. */
const identidades = (linhas: AssetIdentityCandidate[]): string[] => {
  const allocator = createAssetIdentityAllocator().prime(linhas);
  return linhas.map((linha) => allocator.allocate(linha).primarykey);
};

describe('base canónica da identidade', () => {
  it('usa a primarykey da planilha, canonizada só para a chave', () => {
    expect(resolveAssetIdentityBase(LINHA())).toEqual({
      base: '008810CICOPAL',
      origin: 'PRIMARYKEY'
    });
  });

  it('sem primarykey desce para etiqueta/tag', () => {
    const semPk = LINHA({ sourcePrimarykey: '' });
    expect(resolveAssetIdentityBase(semPk)).toEqual({ base: '008810CICOPAL', origin: 'ETIQUETA' });
    const semEtiqueta = LINHA({ sourcePrimarykey: undefined, etiqueta: '', tag: ' TAG-9 ' });
    expect(resolveAssetIdentityBase(semEtiqueta)).toEqual({ base: 'TAG-9', origin: 'ETIQUETA' });
  });

  it('sem nenhuma identidade a base fica vazia (chave derivada do conteúdo)', () => {
    const semNada = LINHA({ sourcePrimarykey: undefined, etiqueta: undefined, tag: undefined });
    expect(resolveAssetIdentityBase(semNada)).toEqual({ base: '', origin: 'CONTEUDO' });
  });

  it('source_primarykey guarda o texto literal, sem trim nem caixa', () => {
    expect(sourcePrimarykeyOf(' 008810 CICOPAL ')).toBe(' 008810 CICOPAL ');
    expect(sourcePrimarykeyOf('')).toBeNull();
    expect(sourcePrimarykeyOf(undefined)).toBeNull();
  });
});

describe('uma linha por registo — nenhuma linha da planilha desaparece', () => {
  it('primarykey única mantém a chave canónica (continuidade da base)', () => {
    expect(identidades([LINHA()])).toEqual(['008810CICOPAL']);
  });

  it('duas linhas com a MESMA primarykey recebem duas identidades distintas', () => {
    const pks = identidades([
      LINHA({}, { descricaodoativo: 'CADEIRA', serial: 'SN-1' }),
      LINHA({}, { descricaodoativo: 'MESA', serial: 'SN-2' })
    ]);

    expect(pks).toHaveLength(2);
    expect(pks[0]).not.toBe(pks[1]);
    // Nenhuma delas é a base crua: a base repetida deixa de identificar.
    expect(pks).not.toContain('008810CICOPAL');
  });

  it('linhas sem primarykey nem etiqueta recebem chave derivada do conteúdo', () => {
    const semIdentidade = LINHA({ sourcePrimarykey: undefined, etiqueta: undefined, tag: undefined });
    const [a] = identidades([semIdentidade, { ...semIdentidade, row: { descricaodoativo: 'OUTRO' } }]);
    expect(a.startsWith('SEM-ETIQUETA-')).toBe(true);
    expect(identidades([semIdentidade])).toEqual([a]);
  });

  it('duas linhas absolutamente idênticas continuam a ser dois registos', () => {
    const pk = LINHA();
    const pks = identidades([pk, pk]);
    expect(pks[0]).not.toBe(pks[1]);
  });

  it('a mesma chave de origem em contratos diferentes não colide', () => {
    const pks = identidades([LINHA(), LINHA({ tenantid: 'CLIENTETESTE' })]);
    expect(pks).toEqual(['008810CICOPAL', '008810CICOPAL']);
  });
});

describe('idempotência da reimportação', () => {
  it('o mesmo arquivo produz as mesmas identidades (duas cargas seguidas)', () => {
    const arquivo = () => [
      LINHA({}, { descricaodoativo: 'CADEIRA', serial: 'SN-1' }),
      LINHA({}, { descricaodoativo: 'MESA', serial: 'SN-2' })
    ];
    expect(identidades(arquivo())).toEqual(identidades(arquivo()));
  });

  it('reordenar as linhas não muda a identidade de nenhuma delas', () => {
    const cadeira = LINHA({}, { descricaodoativo: 'CADEIRA', serial: 'SN-1' });
    const mesa = LINHA({}, { descricaodoativo: 'MESA', serial: 'SN-2' });

    const direto = Object.fromEntries(
      [cadeira, mesa].map((linha, idx) => [String(linha.row?.descricaodoativo), identidades([cadeira, mesa])[idx]])
    );
    const invertido = Object.fromEntries(
      [mesa, cadeira].map((linha, idx) => [String(linha.row?.descricaodoativo), identidades([mesa, cadeira])[idx]])
    );

    expect(invertido).toEqual(direto);
  });
});

describe('newImportBatchId', () => {
  it('identifica a carga e nunca repete valores', () => {
    const a = newImportBatchId();
    const b = newImportBatchId();
    expect(a.startsWith('CARGA-')).toBe(true);
    expect(a).not.toBe(b);
  });
});
