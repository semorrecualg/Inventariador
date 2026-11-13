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
 * `sn1_recno` é a chave do registo na base de origem: copiá-la criaria
 * duplicidade. O valor é preservado como **`rad_recno`** — `rad_` é a
 * abreviação de **REGISTRO ADOTADO** e `recno` é a cópia do valor. Assim o
 * vínculo com o original fica registado numa tag própria, sem colidir.
 *
 * `registro` também NÃO é copiado: é o número do registo na unidade de origem
 * e dois registos com o mesmo número na mesma unidade quebram o De/Para de
 * fecho. O valor original vai em `_copiadoDeRegistro`, para rastreio.
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
 */
export const buildCopyForNewItem = (
  origem: Asset,
  destino: DestinoDoItemNovo,
): Partial<Asset> => {
  const copia: Partial<Asset> = {};

  for (const campo of CAMPOS_DESCRITIVOS) {
    const valor = origem[campo];
    if (naoVazio(valor)) {
      (copia as Record<string, unknown>)[campo] = valor;
    }
  }

  const etiqueta = String(destino.etiqueta || origem.etiqueta || '').trim().toUpperCase();
  const recnoOrigem = origem.sn1_recno;

  return {
    ...copia,
    etiqueta,
    qt: origem.qt && origem.qt > 0 ? origem.qt : 1,
    dataaqusic: origem.dataaqusic || destino.hoje || '',
    filial: destino.unidade || '',
    endereco: destino.endereco || '',
    AUDITOR_LOCAL_AUDITADO: destino.endereco || '',
    status: 'ATIVO',
    // `sn1_recno` do original nunca é copiado: o valor fica em `rad_recno`.
    ...(typeof recnoOrigem === 'number' ? { rad_recno: recnoOrigem } : {}),
    _copiadoDe: origem.filial || origem._unitid || '',
    _copiadoDeEtiqueta: origem.etiqueta || '',
    _copiadoDeRegistro: origem.registro || '',
    _copiadoDeRecno: typeof recnoOrigem === 'number' ? recnoOrigem : null,
  };
};
