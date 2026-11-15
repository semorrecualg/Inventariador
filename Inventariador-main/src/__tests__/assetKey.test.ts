import { describe, it, expect } from 'vitest';
import {
  contractAssetKey,
  createFallbackKeyAllocator,
  contentFingerprint,
  fallbackAssetKey,
  isFallbackAssetKey,
  resolveAssetKey,
  sanitizeAssetKey,
  FALLBACK_KEY_PREFIX
} from '../utils/assetKey';

/**
 * A chave do ativo tem de ser IGUAL em todos os caminhos que gravam. Antes,
 * `ABC-1`, `abc-1` e `ABC1` viravam três linhas (a chave local é composta
 * [tenantid + primarykey]), e a Unidade Operacional somava 4× os mesmos ativos.
 */
describe('assetKey · sanear a chave', () => {
  it('normaliza caixa, espaços e separadores', () => {
    expect(sanitizeAssetKey(' ab-c1 ')).toBe('AB-C1');
    expect(sanitizeAssetKey('010101 00000049670018')).toBe('01010100000049670018');
    expect(sanitizeAssetKey('010101.0004967/0018')).toBe('01010100049670018');
    expect(sanitizeAssetKey('010101_CICOPAL')).toBe('010101CICOPAL');
  });

  it('vazio, nulo e indefinido devolvem chave vazia (nunca inventa)', () => {
    expect(sanitizeAssetKey('')).toBe('');
    expect(sanitizeAssetKey('   ')).toBe('');
    expect(sanitizeAssetKey(null)).toBe('');
    expect(sanitizeAssetKey(undefined)).toBe('');
    expect(sanitizeAssetKey('///')).toBe('');
  });

  it('é idempotente: sanear duas vezes dá o mesmo resultado', () => {
    const once = sanitizeAssetKey(' abc-1/x ');
    expect(sanitizeAssetKey(once)).toBe(once);
  });
});

describe('assetKey · chave derivada (fim do ALT- aleatório)', () => {
  const row = { descricaodoativo: 'CADEIRA GIRATORIA', serial: 'S1', qt: 1 };

  it('mesma linha produz sempre a mesma chave', () => {
    const fingerprint = contentFingerprint(row);
    const a = fallbackAssetKey('CICOPAL', '010101 CICOPAL GO', fingerprint);
    const b = fallbackAssetKey('CICOPAL', '010101 CICOPAL GO', fingerprint);
    expect(a).toBe(b);
    expect(a.startsWith(`${FALLBACK_KEY_PREFIX}-`)).toBe(true);
    expect(isFallbackAssetKey(a)).toBe(true);
  });

  it('contrato, filial ou conteúdo diferentes dão chaves diferentes', () => {
    const fingerprint = contentFingerprint(row);
    const base = fallbackAssetKey('CICOPAL', '010101 CICOPAL GO', fingerprint);
    expect(fallbackAssetKey('OUTRO', '010101 CICOPAL GO', fingerprint)).not.toBe(base);
    expect(fallbackAssetKey('CICOPAL', '010102 CICOPAL GO', fingerprint)).not.toBe(base);
    expect(fallbackAssetKey('CICOPAL', '010101 CICOPAL GO', contentFingerprint({ ...row, serial: 'S2' }))).not.toBe(base);
  });

  it('linhas genuinamente repetidas no mesmo arquivo ganham chaves distintas e estáveis', () => {
    const fingerprint = contentFingerprint(row);
    const load1 = createFallbackKeyAllocator();
    const first = load1('CICOPAL', '010101 CICOPAL GO', fingerprint);
    const second = load1('CICOPAL', '010101 CICOPAL GO', fingerprint);
    expect(first).not.toBe(second);

    // Reimportar o MESMO arquivo reproduz exatamente as mesmas chaves.
    const load2 = createFallbackKeyAllocator();
    expect(load2('CICOPAL', '010101 CICOPAL GO', fingerprint)).toBe(first);
    expect(load2('CICOPAL', '010101 CICOPAL GO', fingerprint)).toBe(second);
  });

  it('a impressão digital ignora chaves técnicas (tenantid, filial, flags)', () => {
    const a = contentFingerprint({ ...row, tenantid: 'CICOPAL', filial: 'X', _conferido: 1 } as Record<string, unknown>);
    const b = contentFingerprint({ ...row, tenantid: 'OUTRO', filial: 'Y' } as Record<string, unknown>);
    expect(a).toBe(b);
  });
});

describe('assetKey · chave do contrato (tenantid + filial + registro + subreg)', () => {
  it('monta a chave com os quatro campos, saneados', () => {
    expect(contractAssetKey({ tenantid: 'cicopal', filial: '010101 cicopal go', registro: ' 123 ', subreg: '2' }))
      .toBe('CICOPAL-010101CICOPALGO-123-2');
  });

  it('usa os campos que existirem, sem separadores a mais', () => {
    expect(contractAssetKey({ tenantid: 'CICOPAL', filial: '010101', registro: '123' }))
      .toBe('CICOPAL-010101-123');
    expect(contractAssetKey({ tenantid: 'CICOPAL', filial: '010101', subreg: '003' }))
      .toBe('CICOPAL-010101-003');
  });

  it('sem registro nem subreg não há identidade de contrato', () => {
    expect(contractAssetKey({ tenantid: 'CICOPAL', filial: '010101', etiqueta: 'ETQ-1' })).toBe('');
  });
});

describe('assetKey · resolução da chave de um ativo', () => {
  it('segue a ordem primarykey → tenantid+filial+registro+subreg → derivada', () => {
    const fallback = () => 'SEM-ETIQUETA-FALLBACK';
    const contrato = { tenantid: 'CICOPAL', filial: '010101', registro: '123', subreg: '2' };
    expect(resolveAssetKey({ primarykey: 'pk-1', ...contrato }, fallback)).toBe('PK-1');
    expect(resolveAssetKey({ primarykey: '  ', ...contrato }, fallback)).toBe('CICOPAL-010101-123-2');
    expect(resolveAssetKey({ ...contrato, subreg: '' }, fallback)).toBe('CICOPAL-010101-123');
    expect(resolveAssetKey({}, fallback)).toBe('SEM-ETIQUETA-FALLBACK');
  });

  it('nunca usa a etiqueta como chave: ela repete-se entre linhas', () => {
    const fallback = () => 'SEM-ETIQUETA-FALLBACK';
    expect(resolveAssetKey({ etiqueta: 'ETQ 1' }, fallback)).toBe('SEM-ETIQUETA-FALLBACK');
    expect(resolveAssetKey({ tag: 'TAG-3' }, fallback)).toBe('SEM-ETIQUETA-FALLBACK');
  });

  it('só chama a derivada quando não há nenhuma identidade', () => {
    let calls = 0;
    const fallback = () => {
      calls += 1;
      return 'SEM-ETIQUETA-X';
    };
    resolveAssetKey({ primarykey: 'pk-1' }, fallback);
    expect(calls).toBe(0);
    resolveAssetKey({ tenantid: 'CICOPAL', filial: '010101', registro: 'R-1' }, fallback);
    expect(calls).toBe(0);
    resolveAssetKey({ etiqueta: 'ETQ-1' }, fallback);
    expect(calls).toBe(1);
  });
});
