import { describe, expect, it } from 'vitest';
import { assetUuid, uuidV5, GBR_INVENTORY_NAMESPACE } from '../services/uuidV5';

const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const UUID_V5_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidV5', () => {
  it('reproduz o vetor canônico do RFC 4122 (namespace DNS)', () => {
    expect(uuidV5('www.example.com', DNS_NAMESPACE)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('é determinístico e devolve um UUID versão 5 válido', () => {
    const a = uuidV5('0101010000004969001');
    const b = uuidV5('0101010000004969001');
    expect(a).toBe(b);
    expect(a).toMatch(UUID_V5_REGEX);
  });

  it('muda quando o nome muda', () => {
    expect(uuidV5('A')).not.toBe(uuidV5('B'));
  });
});

describe('assetUuid', () => {
  it('separa a mesma chave de origem por contrato', () => {
    expect(assetUuid('CICOPAL', '0101010000004969001')).not.toBe(
      assetUuid('CLIENTETESTE', '0101010000004969001')
    );
  });

  it('normaliza tenant (trim/UPPER) e chave, para o upsert ser idempotente', () => {
    expect(assetUuid(' cicopal ', ' 0101010000004969001 ')).toBe(
      assetUuid('CICOPAL', '0101010000004969001')
    );
  });

  it('respeita o namespace fixo do produto', () => {
    expect(assetUuid('CICOPAL', 'X')).toBe(uuidV5('CICOPAL|X', GBR_INVENTORY_NAMESPACE));
  });
});
