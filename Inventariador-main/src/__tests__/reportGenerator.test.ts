// ============================================================================
// reportGenerator.test.ts — os PDFs leem a regra de conferido do predicado.
//
// O BOOK e as fichas KARDEX diziam «CONFERIDO» só quando a flag local
// `_conferido` estava ligada, ignorando a coluna de auditoria da base
// (`AUDITOR_STATUS_CONFERENCIA === 'SIM'`). Um ativo conferido pela planilha
// saía como PENDENTE no relatório impresso.
//
// O jsPDF é substituído por um espião: aqui interessa o que o gerador manda
// escrever, não o PDF real.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

type DocFalso = {
  textos: string[];
  tabelas: unknown[][][];
};

const { docs } = vi.hoisted(() => ({ docs: [] as DocFalso[] }));

vi.mock('jspdf', () => {
  class DocFalso {
    textos: string[] = [];
    tabelas: unknown[][][] = [];
    lastAutoTable = { finalY: 120 };

    constructor() {
      docs.push(this as unknown as DocFalso);
    }

    setFontSize() {}
    setTextColor() {}
    setFillColor() {}
    line() {}
    rect() {}
    addPage() {}
    addImage() {}
    save() {}
    splitTextToSize(texto: string) {
      return [texto];
    }
    text(texto: unknown) {
      this.textos.push(String(texto));
    }
    autoTable(opcoes: { body: unknown[][] }) {
      this.tabelas.push(opcoes.body);
    }
  }

  return { default: DocFalso };
});

vi.mock('jspdf-autotable', () => ({}));

vi.mock('../services/photoService', () => ({
  getLocalPhoto: vi.fn(async () => null)
}));

import type { Asset } from '../types';
import { generateInventoryBook, generateKardexFichas } from '../utils/reportGenerator';

const ativo = (over: Record<string, unknown> = {}): Asset =>
  ({
    id: 'A1',
    etiqueta: '008491',
    descricaodoativo: 'CADEIRA GIRATÓRIA',
    endereco: '151200 CONTABILIDADE',
    ...over
  }) as unknown as Asset;

beforeEach(() => {
  docs.length = 0;
});

describe('generateInventoryBook — coluna «Status» da tabela', () => {
  it('marca CONFERIDO pela flag local e pela coluna de auditoria, e PENDENTE sem nenhuma', async () => {
    await generateInventoryBook(
      [
        ativo({ id: 'A1', _conferido: true }),
        ativo({ id: 'A2', AUDITOR_STATUS_CONFERENCIA: 'sim' }),
        ativo({ id: 'A3' })
      ],
      'CICOPAL GO'
    );

    const tabela = docs[0]?.tabelas[0];
    expect(tabela).toBeDefined();
    // Etiqueta | Descrição | Localização | Status | Tag
    expect(tabela.map(linha => linha[3])).toEqual(['CONFERIDO', 'CONFERIDO', 'PENDENTE']);
  });
});

describe('generateKardexFichas — linha «CONFERIDO» da auditoria', () => {
  it('imprime SIM para um ativo conferido pela coluna e NÃO para o pendente', async () => {
    await generateKardexFichas(
      [
        ativo({ id: 'B1', AUDITOR_STATUS_CONFERENCIA: 'SIM' }),
        ativo({ id: 'B2', _conferido: 0 })
      ],
      'CICOPAL GO'
    );

    const textos = docs.flatMap(doc => doc.textos);
    expect(textos).toContain('CONFERIDO: SIM');
    expect(textos).toContain('CONFERIDO: NÃO');
  });
});
