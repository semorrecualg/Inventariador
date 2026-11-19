import { normalizeFlag } from './normalize';

/**
 * «CONFERIDO» É UMA SÓ IDEIA
 * ============================================================================
 * A conferência chega por duas vias e ambas valem: a flag local `_conferido`
 * (booleano, 1/0 do Dexie/SQLite, ou as escritas legadas que `normalizeFlag`
 * já unifica) e a coluna de auditoria da base
 * (`AUDITOR_STATUS_CONFERENCIA === 'SIM'`), que é o que uma planilha já
 * conferida traz.
 *
 * O selo de sincronização, o cartão do ativo, a matriz de tags, o painel e o
 * inventário liam esta regra cada um à sua maneira — o selo só olhava para
 * `_conferido`, o cartão também aceitava a coluna, e o inventário comparava
 * com `_conferido === 1`. A regra passa a viver aqui, uma vez.
 *
 * O mesmo vale para os contadores (painel, unidades, conciliação, etiquetagem,
 * busca ativa, limpeza de cópias) e para quem GRAVA a flag a partir de uma
 * linha já existente (importação, carga da planilha): comparar `_conferido`
 * com `1` à mão deixava de fora as escritas legadas (`'1'`, `true`) e a coluna
 * de auditoria.
 */
export type CamposDeConferencia = {
  _conferido?: unknown;
  AUDITOR_STATUS_CONFERENCIA?: unknown;
  status?: unknown;
};

export const isConferido = (asset: CamposDeConferencia): boolean =>
  normalizeFlag(asset._conferido) ||
  String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';

/**
 * O `status` textual também é marcador de conferência: a planilha/ERP traz
 * «CONFERIDO» e a carga, o envio e o pull da nuvem leem-no como conferido.
 * Deixá-lo de pé ao desmarcar contradizia a flag e a decisão perdia-se na
 * sincronização: o envio voltava a gravar `conferido = true` (o `status` era
 * lido como marcador) e o item regressava conferido ao aparelho.
 *
 * Só o marcador é substituído — um status de outro teor fica como está.
 */
export const statusAoDesmarcar = (status: unknown): string =>
  /conferido/i.test(String(status ?? '')) ? 'PENDENTE' : String(status ?? '');

/** Campos que uma marcação/desmarcação altera no ativo. */
export type PatchDeConferencia = {
  _conferido: boolean;
  _dataLeitura?: string;
  status?: string;
  AUDITOR_STATUS_CONFERENCIA?: unknown;
};

/**
 * A decisão de (des)marcar um ativo — a mesma em qualquer ecrã.
 *
 * Desmarcar tem de apagar TODAS as provas de conferência que o ativo carrega,
 * senão `isConferido` (e o envio da nuvem) continuam a dizer que ele está
 * conferido: a flag vai a 0, o `status` perde o marcador e a coluna de
 * auditoria passa a NAO. Marcar devolve só a flag e a data da leitura.
 */
export const alternarConferencia = (
  asset: CamposDeConferencia,
  agora: string = new Date().toISOString()
): PatchDeConferencia => {
  if (!isConferido(asset)) {
    return { _conferido: true, _dataLeitura: agora };
  }

  return {
    _conferido: false,
    _dataLeitura: undefined,
    status: statusAoDesmarcar(asset.status),
    AUDITOR_STATUS_CONFERENCIA: 'NAO'
  };
};
