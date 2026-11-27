import type { Asset } from '../types';
import { addressKey, plaquetaKey, unitKey } from './etiquetaGroup';

export type AlvoDaInclusaoManual = {
  /** Etiqueta digitada no formulário da inclusão manual. */
  etiqueta?: unknown;
  /** Unidade (filial) do inventário aberto. */
  unidade?: unknown;
  /** Endereço aberto no inventário. */
  endereco?: unknown;
  /** Registo em edição: nunca é candidato a completar-se a si mesmo. */
  exceptoId?: unknown;
};

const semTexto = (valor: unknown): boolean => !String(valor ?? '').trim();

/**
 * A INCLUSÃO MANUAL COMPLETA O RASCUNHO EM BRANCO DA MESMA ETIQUETA
 * ============================================================================
 * O item é incluído à mão porque não existe no cadastro — mas o registo da
 * etiqueta pode já ter sido criado numa tentativa anterior (ou na leitura) sem
 * descrição e sem série. Nesse caso o registo novo ficava barrado como
 * «etiqueta duplicada», o formulário fechava e o texto que o auditor escreveu
 * desaparecia: o cartão continuava «SEM DESCRIÇÃO · S/N».
 *
 * Completar o rascunho é o que o auditor pediu ao digitar a descrição e a
 * série. A regra é estreita de propósito — só apanha um registo que está
 * mesmo vazio nos dois campos, na MESMA unidade e no MESMO endereço. Um
 * registo já descrito nunca é tocado: plaquetas repetidas com itens distintos
 * (lote de cadeiras, por exemplo) continuam a criar registos separados.
 *
 * Função pura: recebe a lista em memória, para ser testável sem IndexedDB.
 */
export const rascunhoDaInclusaoManual = (
  assets: Asset[] | null | undefined,
  alvo: AlvoDaInclusaoManual
): Asset | undefined => {
  const etiqueta = plaquetaKey({ etiqueta: String(alvo.etiqueta ?? '') });
  const unidade = unitKey({ filial: String(alvo.unidade ?? '') });
  if (!etiqueta || !unidade || !Array.isArray(assets)) return undefined;

  const endereco = addressKey({ endereco: String(alvo.endereco ?? '') });
  const exceptoId = String(alvo.exceptoId ?? '');

  return assets.find(
    (a) =>
      plaquetaKey(a) === etiqueta &&
      String(a.id ?? '') !== exceptoId &&
      unitKey(a) === unidade &&
      addressKey(a) === endereco &&
      semTexto(a.descricaodoativo) &&
      semTexto(a.serial) &&
      !a._is_deleted
  );
};
