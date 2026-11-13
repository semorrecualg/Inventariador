import type { Asset } from '../types';

/**
 * CÓPIA DE DADOS ENTRE REGISTOS — "não localizado" em outra unidade
 * ============================================================================
 * Quando a plaqueta não existe na unidade em inventário, o auditor pode
 * pesquisar as outras unidades, ver a **Ficha do Ativo** e copiar os dados
 * descritivos para um item novo DESTA unidade. O registo de origem nunca é
 * alterado.
 *
 * A cópia é uma **lista branca**: só viajam campos que descrevem o bem.
 * Antes era uma lista negra (`delete` dos campos de controle), e o que não
 * estava na lista viajava junto — `primarykey`, `_is_synced` e `sn1_recno`
 * iam para o registo novo. Com `_is_synced` verdadeiro o item podia nunca
 * subir (a fila acha que já está na nuvem) e `primarykey`/`sn1_recno`
 * duplicados apontavam para o registo original em vez do novo.
 *
 * IDENTIDADE DO REGISTO ADOTADO
 * ----------------------------------------------------------------------------
 * O registo novo não herda `sn1_recno` nem `registro` da origem. Ele recebe
 * uma identidade própria, sequencial e legível:
 *
 *     rad_000001, rad_000002, ...        ← `rad_recno` e `registro`
 *     subreg = 0001, 0002, ...           ← sub-itens do mesmo registro
 *
 * `rad_` é a abreviação de **REGISTRO ADOTADO**; os 6 dígitos são a sequência
 * crescente. Isso resolve o caso em que o utilizador esquece (ou a base não
 * tem) o `sn1_recno` da origem: o registo adotado nunca fica sem identificação
 * e nunca duplica a chave de ninguém. O valor original, quando existe, fica
 * guardado em `_copiadoDeRecno` para rastreio.
 *
 * `registro` e `rad_recno` recebem o **mesmo rótulo** — é por `registro` que o
 * De/Para e a conferência em lote agrupam os sub-itens, e por `subreg` que cada
 * item do grupo se distingue.
 */

/** Campos que descrevem o bem e podem ser copiados para o item novo. */
export const CAMPOS_DESCRITIVOS = [
  'descricaodoativo',
  'serial',
  'qt',
  'dataaqusic',
  'nomefornecedor',
  'notafiscal',
  'vlraquisic',
  'contacontabil',
  'centrodecusto',
] as const satisfies ReadonlyArray<keyof Asset>;

export type CampoDescritivo = (typeof CAMPOS_DESCRITIVOS)[number];

/** Prefixo do REGISTRO ADOTADO. */
export const RAD_PREFIX = 'rad_';
const RAD_DIGITS = 6;
const SUBREG_DIGITS = 4;
const RAD_LABEL_RE = /^rad_(\d+)$/i;

/** Rótulo `rad_NNNNNN` a partir da sequência. */
export const radLabel = (sequencia: number): string => {
  const n = Number.isFinite(sequencia) ? Math.max(1, Math.trunc(sequencia)) : 1;
  return `${RAD_PREFIX}${String(n).padStart(RAD_DIGITS, '0')}`;
};

/** Sequência de um rótulo `rad_NNNNNN` (null quando não é um rótulo RAD). */
export const radSequenceOf = (valor: unknown): number | null => {
  const texto = String(valor ?? '').trim();
  const match = RAD_LABEL_RE.exec(texto);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
};

type ItemExistente = Partial<Asset> | null | undefined;

const valorDe = (item: ItemExistente, chave: string): unknown => {
  if (!item) return undefined;
  return (item as Record<string, unknown>)[chave];
};

/**
 * Próximo rótulo RAD livre, olhando `rad_recno` e `registro` já existentes.
 * Função pura: a lista vem da base carregada (sem IndexedDB no teste).
 */
export const nextRadLabel = (existentes: readonly ItemExistente[] = []): string => {
  let maior = 0;
  for (const item of existentes) {
    for (const chave of ['rad_recno', 'registro']) {
      const seq = radSequenceOf(valorDe(item, chave));
      if (seq !== null && seq > maior) maior = seq;
    }
  }
  return radLabel(maior + 1);
};

/**
 * Próximo `subreg` do registro indicado. Sem sub-itens ainda → `0001`.
 * Se o mesmo registro for reaproveitado, continua a série (`0002`, ...).
 */
export const nextSubreg = (
  registro: string,
  existentes: readonly ItemExistente[] = [],
): string => {
  const alvo = String(registro || '').trim().toUpperCase();
  if (!alvo) return '0001';

  let maior = 0;
  for (const item of existentes) {
    if (String(valorDe(item, 'registro') ?? '').trim().toUpperCase() !== alvo) continue;
    const digitos = String(valorDe(item, 'subreg') ?? '').replace(/\D/g, '');
    const n = Number(digitos);
    if (digitos !== '' && Number.isFinite(n) && n > maior) maior = n;
  }
  return String(maior + 1).padStart(SUBREG_DIGITS, '0');
};

export interface DestinoDoItemNovo {
  /** Unidade selecionada e autorizada no ecrã. */
  unidade: string | null | undefined;
  /** Endereço de inventário aberto (o mesmo que o App usa em `_localMaster`). */
  endereco: string | null | undefined;
  /** Código lido/digitado que disparou a busca. Sem ele usa a plaqueta de origem. */
  etiqueta?: string | null;
  /** Data de hoje, no formato do app — injetada para o teste ser determinístico. */
  hoje?: string;
}

const naoVazio = (valor: unknown): boolean => {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === 'string') return valor.trim() !== '';
  return true;
};

/**
 * Monta o `Partial<Asset>` que pré-preenche o formulário de item novo.
 * Função pura: não toca no registo de origem nem em estado de tela.
 *
 * @param existentes base carregada, usada só para achar o próximo `rad_NNNNNN`
 *   e o próximo `subreg`.
 */
export const buildCopyForNewItem = (
  origem: Asset,
  destino: DestinoDoItemNovo,
  existentes: readonly ItemExistente[] = [],
): Partial<Asset> => {
  const copia: Partial<Asset> = {};

  for (const campo of CAMPOS_DESCRITIVOS) {
    const valor = origem[campo];
    if (naoVazio(valor)) {
      (copia as Record<string, unknown>)[campo] = valor;
    }
  }

  const etiqueta = String(destino.etiqueta || origem.etiqueta || '').trim().toUpperCase();
  const registroAdotado = nextRadLabel(existentes);
  const recnoOrigem = origem.sn1_recno;

  return {
    ...copia,
    etiqueta,
    qt: origem.qt && origem.qt > 0 ? origem.qt : 1,
    dataaqusic: origem.dataaqusic || destino.hoje || '',
    // IDENTIDADE DO REGISTRO ADOTADO: rótulo próprio, sequencial, sem herdar
    // `sn1_recno` nem `registro` da origem.
    registro: registroAdotado,
    subreg: nextSubreg(registroAdotado, existentes),
    rad_recno: registroAdotado,
    filial: destino.unidade || '',
    endereco: destino.endereco || '',
    AUDITOR_LOCAL_AUDITADO: destino.endereco || '',
    status: 'ATIVO',
    _copiadoDe: origem.filial || origem._unitid || '',
    _copiadoDeEtiqueta: origem.etiqueta || '',
    _copiadoDeRegistro: origem.registro || '',
    _copiadoDeRecno: typeof recnoOrigem === 'number' ? recnoOrigem : null,
  };
};
