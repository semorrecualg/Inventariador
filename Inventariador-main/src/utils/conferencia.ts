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
 *
 * E a ESCRITA da decisão também é uma só: `marcarConferido` e
 * `desmarcarConferido` são o par que qualquer ecrã grava. Antes cada sítio
 * montava o patch à mão — uns `1`, outros `true`, uns com a data da leitura,
 * outros sem —, e foi isso que deixou o desmarcar de um ecrã não resistir ao
 * envio do outro.
 */
/**
 * Grafias que a marca local de conferência pode ter.
 *
 * Não é uma grafia por gosto: são as que existem nos registos. O App e o Dexie
 * gravam booleano (`true`/`false`); a carga da planilha, o espelho SQLite e o
 * envio gravam `1`/`0`; o JSON importado e as linhas antigas trazem o texto
 * `'true'`/`'1'`/`'0'`. `null` cobre o registo que tem a chave sem valor.
 *
 * `normalizeFlag` é quem as unifica, e `isConferido` é quem decide. As
 * estruturas concretas (`Asset`, `DexieAsset`, `DedupRow`) usam este tipo para
 * o compilador não deixar voltar a tratá-las como se fossem só booleanas.
 */
export type MarcaDeConferencia = boolean | number | string | null;

export type CamposDeConferencia = {
  // `unknown` de propósito: é a fronteira (Dexie, nuvem, planilha, JSON). Nas
  // estruturas já normalizadas o tipo é `MarcaDeConferencia`.
  _conferido?: unknown;
  AUDITOR_STATUS_CONFERENCIA?: unknown;
  status?: unknown;
};

export const isConferido = (asset: CamposDeConferencia): boolean =>
  normalizeFlag(asset._conferido) ||
  String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';

/**
 * A marca LOCAL já está na grafia canônica?
 *
 * Diferente de `isConferido`: aqui só conta a flag (`_conferido`), não a coluna
 * de auditoria nem o `status`. É o que o arranque pergunta antes de reescrever
 * o registo — um ativo conferido só pela coluna de auditoria precisa da escrita;
 * um que já tem `true`, `1` ou `'1'` não precisa. Ler `!asset._conferido` à mão
 * reescrevia (e regravava a leitura) em todos os registos com `'1'`.
 */
export const marcaLocalConferida = (asset: CamposDeConferencia): boolean =>
  normalizeFlag(asset._conferido);

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
 * Marcar: a flag e o carimbo da leitura, num patch só.
 *
 * O `status` textual não é reescrito (ao contrário do desmarcar): um item
 * conferido continua a poder chamar-se «CONFERIDO» no ERP, e quem precisa de
 * mudar a etiqueta fá-lo explicitamente no mesmo objeto. O momento é
 * parâmetro para os caminhos que já trazem a data (normalização no arranque,
 * restauro de espelho) não inventarem uma leitura nova.
 */
export const marcarConferido = (agora?: string): PatchDeConferencia => ({
  _conferido: true,
  _dataLeitura: agora ?? new Date().toISOString()
});

/**
 * Desmarcar: apaga TODAS as provas de conferência que o ativo carrega.
 *
 * Se alguma ficar de pé — a flag, o marcador no `status` ou a coluna de
 * auditoria —, `isConferido` e o envio da nuvem continuam a dizer que ele está
 * conferido e o item regressa conferido ao aparelho.
 */
export const desmarcarConferido = (asset: CamposDeConferencia): PatchDeConferencia => ({
  _conferido: false,
  _dataLeitura: undefined,
  status: statusAoDesmarcar(asset.status),
  AUDITOR_STATUS_CONFERENCIA: 'NAO'
});

/** A decisão de (des)marcar um ativo — a mesma em qualquer ecrã. */
export const alternarConferencia = (
  asset: CamposDeConferencia,
  agora?: string
): PatchDeConferencia =>
  isConferido(asset) ? desmarcarConferido(asset) : marcarConferido(agora);
