import { describe, it, expect } from 'vitest';
import {
  describeRecnoCollision,
  findRecnoCollisions,
  recnoKeyOf,
  sameRecnoData,
  type RecnoCandidate
} from '../utils/recnoGuard';

const base = (over: Partial<RecnoCandidate>): RecnoCandidate => ({
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  sn1_recno: 100,
  etiqueta: 'ETQ-1',
  descricaodoativo: 'CADEIRA GIRATORIA',
  vlraquisic: 100.5,
  primarykey: 'PK-1',
  ...over
});

/**
 * `sn1_recno` NÃO é chave única na base real (15 grupos com ativos diferentes),
 * por isso o guardião só AVISA quando o recno repete com dados divergentes.
 */
describe('recnoGuard · chave do recno', () => {
  it('junta tenantid + filial normalizada + recno', () => {
    expect(recnoKeyOf(base({}))).toBe('CICOPAL|010101 CICOPAL GO|100');
    expect(recnoKeyOf(base({ filial_raw: '  010101   cicopal-go ' }))).toBe('CICOPAL|010101 CICOPAL GO|100');
  });

  it('sem recno utilizável não há chave (ativo criado no app, sobra, planilha sem coluna)', () => {
    expect(recnoKeyOf(base({ sn1_recno: null }))).toBe('');
    expect(recnoKeyOf(base({ sn1_recno: 0 }))).toBe('');
    expect(recnoKeyOf(base({ sn1_recno: 'abc' }))).toBe('');
    expect(recnoKeyOf(null)).toBe('');
  });

  it('contratos diferentes com o mesmo recno não se misturam', () => {
    expect(recnoKeyOf(base({ tenantid: 'OUTRO' }))).not.toBe(recnoKeyOf(base({})));
  });
});

describe('recnoGuard · comparação de dados', () => {
  it('mesma etiqueta, descrição e valor = mesmo registo', () => {
    expect(sameRecnoData(base({}), base({ vlraquisic: 100.5 }))).toBe(true);
    expect(sameRecnoData(base({ vlraquisic: 100.5 }), base({ vlraquisic: 'R$ 100,50' }))).toBe(true);
  });

  it('etiqueta, descrição ou valor diferentes = ativos diferentes', () => {
    expect(sameRecnoData(base({}), base({ etiqueta: 'ETQ-2' }))).toBe(false);
    expect(sameRecnoData(base({}), base({ descricaodoativo: 'MESA' }))).toBe(false);
    expect(sameRecnoData(base({}), base({ vlraquisic: 900 }))).toBe(false);
  });

  it('campo ausente de um dos lados não é diferença (conferência manda registo parcial)', () => {
    expect(sameRecnoData(base({}), { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', sn1_recno: 100, etiqueta: 'ETQ-1' })).toBe(true);
  });

  it('acentos e caixa não contam como diferença', () => {
    expect(sameRecnoData(base({ descricaodoativo: 'CADEIRA GIRATÓRIA' }), base({ descricaodoativo: 'cadeira giratoria' }))).toBe(true);
  });
});

describe('recnoGuard · conflitos', () => {
  it('recno repetido com dados diferentes vira caso de possível duplicidade', () => {
    const collisions = findRecnoCollisions([
      base({ primarykey: 'PK-1', etiqueta: 'ETQ-1' }),
      base({ primarykey: 'PK-2', etiqueta: 'ETQ-2', descricaodoativo: 'MESA', vlraquisic: 3.49 })
    ]);

    expect(collisions).toHaveLength(1);
    expect(collisions[0].recno).toBe(100);
    expect(collisions[0].rows.map((row) => row.etiqueta)).toEqual(['ETQ-1', 'ETQ-2']);
    expect(collisions[0].signature).toContain('ETQ-1');
  });

  it('cópias do MESMO registo não são reportadas aqui (pertencem à limpeza de cópias)', () => {
    const collisions = findRecnoCollisions([
      base({ primarykey: 'COPY-1' }),
      base({ primarykey: 'COPY-2' }),
      base({ primarykey: 'COPY-3' })
    ]);
    expect(collisions).toEqual([]);
  });

  it('recno sem conflito, sem recno e de outra filial não entram', () => {
    const collisions = findRecnoCollisions([
      base({ sn1_recno: 200, primarykey: 'A' }),
      base({ sn1_recno: null, primarykey: 'B' }),
      base({ sn1_recno: 300, filial: '010102 CICOPAL GO', primarykey: 'C' }),
      base({ sn1_recno: 300, filial: '010102 CICOPAL GO', primarykey: 'D', etiqueta: 'OUTRA' })
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].filial).toBe('010102 CICOPAL GO');
  });

  it('descreve o caso em uma linha de relatório', () => {
    const [collision] = findRecnoCollisions([
      base({ primarykey: 'PK-1', etiqueta: 'ETQ-1' }),
      base({ primarykey: 'PK-2', etiqueta: 'ETQ-2', vlraquisic: 3.49 })
    ]);
    expect(describeRecnoCollision(collision)).toBe(
      '[RECNO] 010101 CICOPAL GO · recno 100: ETQ-1(R$ 100.50) × ETQ-2(R$ 3.49)'
    );
  });
});
