import { normalizeKey } from './schema';

/**
 * GUARDIÃO SUAVE DE DUPLICIDADE POR `sn1_recno` (Protheus)
 * ============================================================================
 * `sn1_recno` é o recno do SN1 no Protheus: único POR EMPRESA/FILIAL no file de
 * origem. Na base real, porém, 15 grupos repetem o recno com ATIVOS DIFERENTES
 * (a coluna exportada nem sempre é o recno confiável), então ele NÃO serve como
 * chave única — usá-lo assim bloquearia 31 registos legítimos.
 *
 * Aqui ele é uma SEGUNDA LINHA DE DEFESA: quando o mesmo
 * `tenantid + filial + sn1_recno` aparece com etiqueta, descrição ou valor
 * diferentes, o caso é marcado como POSSÍVEL DUPLICIDADE — nunca bloqueia e
 * nunca apaga. Quem decide é o operador, olhando o relatório.
 */

export interface RecnoCandidate {
  tenantid?: unknown;
  filial?: unknown;
  filial_raw?: unknown;
  sn1_recno?: unknown;
  etiqueta?: unknown;
  descricaodoativo?: unknown;
  vlraquisic?: unknown;
  primarykey?: unknown;
}

export interface RecnoRowSummary {
  primarykey: string;
  etiqueta: string;
  descricao: string;
  valor: number;
}

export interface RecnoCollision {
  /** `TENANTID|FILIAL|RECNO` — identidade do conflito. */
  key: string;
  tenantid: string;
  filial: string;
  recno: number;
  rows: RecnoRowSummary[];
  /** Assinatura estável do conflito (evita auditoria repetida). */
  signature: string;
}

/** Tolerância na comparação de valores (centavos). */
const VALUE_EPSILON = 0.005;

const text = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const valueOf = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = text(value).replace(/[R$\s]/gi, '');
  if (!raw) return 0;
  // 1.234,56 (pt-BR) vs 1234.56 (planilha)
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Chave do recno: `tenantid + filial + sn1_recno`.
 *
 * Devolve `''` quando não há recno utilizável (ativo criado no app, sobra
 * física, planilha sem a coluna) — nesses casos NÃO há verificação, porque
 * `0`/`null` não identificam nada.
 */
export const recnoKeyOf = (asset: RecnoCandidate | null | undefined): string => {
  if (!asset) return '';
  const recno = Number(asset.sn1_recno);
  if (!Number.isFinite(recno) || recno <= 0) return '';
  const tenant = text(asset.tenantid).toUpperCase();
  const filial = normalizeKey(asset.filial_raw || asset.filial);
  return `${tenant}|${filial}|${recno}`;
};

export const summarizeRecnoRow = (asset: RecnoCandidate): RecnoRowSummary => ({
  primarykey: text(asset.primarykey),
  etiqueta: text(asset.etiqueta).toUpperCase(),
  descricao: normalizeKey(asset.descricaodoativo),
  valor: valueOf(asset.vlraquisic)
});

/**
 * Mesmos dados? Compara etiqueta, descrição e valor — é o que separa "a mesma
 * linha gravada duas vezes" (cópia, tratada pela limpeza) de "dois ativos
 * diferentes com o mesmo recno" (possível duplicidade / recno reaproveitado).
 */
export const sameRecnoData = (a: RecnoCandidate, b: RecnoCandidate): boolean => {
  const left = summarizeRecnoRow(a);
  const right = summarizeRecnoRow(b);

  // Só compara o que EXISTE dos dois lados: a conferência de campo envia um
  // registo parcial (às vezes sem descrição ou valor), e um campo ausente não é
  // prova de que o ativo é outro — alarme falso aqui só faria ruído.
  const textDiffers = (x: string, y: string): boolean => !!x && !!y && x !== y;
  const valueDiffers = (x: number, y: number): boolean => x > 0 && y > 0 && Math.abs(x - y) > VALUE_EPSILON;

  return !(
    textDiffers(left.etiqueta, right.etiqueta) ||
    textDiffers(left.descricao, right.descricao) ||
    valueDiffers(left.valor, right.valor)
  );
};

const signatureOf = (rows: RecnoRowSummary[]): string =>
  rows
    .map((row) => `${row.etiqueta}~${row.valor.toFixed(2)}~${row.descricao}`)
    .sort()
    .join('||');

/**
 * Encontra os conflitos de uma lista de ativos: recno repetido com dados
 * diferentes. Grupos com TODOS os dados iguais são cópias (não são reportados
 * aqui — pertencem à limpeza de cópias).
 */
export const findRecnoCollisions = (assets: ReadonlyArray<RecnoCandidate>): RecnoCollision[] => {
  const groups = new Map<string, { tenantid: string; filial: string; recno: number; rows: RecnoCandidate[] }>();

  for (const asset of assets) {
    const key = recnoKeyOf(asset);
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) existing.rows.push(asset);
    else {
      groups.set(key, {
        tenantid: text(asset.tenantid).toUpperCase(),
        filial: normalizeKey(asset.filial_raw || asset.filial),
        recno: Number(asset.sn1_recno),
        rows: [asset]
      });
    }
  }

  const collisions: RecnoCollision[] = [];
  groups.forEach((group, key) => {
    if (group.rows.length < 2) return;
    const first = group.rows[0];
    const diverges = group.rows.some((row) => !sameRecnoData(first, row));
    if (!diverges) return; // cópias do mesmo registo: não é este guardião
    const rows = group.rows.map(summarizeRecnoRow);
    collisions.push({
      key,
      tenantid: group.tenantid,
      filial: group.filial,
      recno: group.recno,
      rows,
      signature: signatureOf(rows)
    });
  });

  return collisions.sort((a, b) => a.filial.localeCompare(b.filial) || a.recno - b.recno);
};

/** Linha de relatório para o log do Gestor de Base / auditoria. */
export const describeRecnoCollision = (collision: RecnoCollision): string =>
  `[RECNO] ${collision.filial} · recno ${collision.recno}: ${collision.rows
    .map((row) => `${row.etiqueta}(R$ ${row.valor.toFixed(2)})`)
    .join(' × ')}`;
