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

/**
 * O PULL NÃO DESFAZ A CONFERÊNCIA FEITA NO APARELHO
 * ============================================================================
 * O pull remonta a linha da nuvem e descartava a decisão de conferência que o
 * aparelho guardava: bastava a linha da nuvem chegar com `_conferido = 0` (ou
 * sem `data_leitura`) para o item voltar a «por conferir» — o auditor conferia
 * no campo, o ciclo seguinte apagava a marca e ninguém sabia porquê. O mesmo
 * defeito de classe do carimbo da falha: um campo que a nuvem não tem não pode
 * ser decidido por omissão.
 *
 * Aqui a decisão é decidida por TEMPO, nunca por ausência: a marca local vale
 * enquanto a leitura da nuvem não for mais recente, e o desmarcar local vale
 * enquanto a conferência da nuvem não for posterior ao toque. Sem data de
 * nenhum dos lados não se inventa prova — a linha da nuvem fica.
 *
 * Limite conhecido (item 24b da agenda): um aparelho com edição pendente e uma
 * conferência alheia mais antiga continua a fazer valer a sua decisão; o
 * conflito por campo é o que resolve os dois auditores no mesmo ativo.
 */
export type CamposDeDecisaoDeConferencia = CamposDeConferencia & {
  _auditor?: unknown;
  _dataLeitura?: unknown;
  _lastUpdated?: unknown;
};

/** Os campos que guardam a decisão (quem, quando, com que prova). */
const CAMPOS_DA_DECISAO = [
  '_conferido',
  '_auditor',
  '_dataLeitura',
  'AUDITOR_STATUS_CONFERENCIA',
  'status',
] as const;

/**
 * A decisão já no vocabulário do app (é o que volta ao registo no merge).
 *
 * Tipos estreitos de propósito: o merge do pull é tipado `Asset` e um
 * `unknown` aqui alargava o registo a `Asset | { status: unknown }` — o `tsc`
 * apanhou isso. A fronteira (Dexie/nuvem) entra como `unknown` e é copiada sem
 * reinterpretação; estes campos só têm as grafias que `isConferido` lê.
 */
export type DecisaoDeConferencia = {
  _conferido?: MarcaDeConferencia;
  _auditor?: string;
  _dataLeitura?: string;
  AUDITOR_STATUS_CONFERENCIA?: MarcaDeConferencia;
  status?: string;
};

/** Data legível em ms; `NaN` quando o campo não traz data nenhuma. */
const instante = (valor: unknown): number => {
  const lido = Date.parse(String(valor ?? ''));
  return Number.isFinite(lido) ? lido : NaN;
};

/**
 * A decisão local, no vocabulário do app — só os campos que o registo TEM.
 *
 * Copiar só o que existe é o que impede o merge de escrever `undefined` numa
 * decisão que o aparelho nunca tomou (o desmarcar grava `_dataLeitura`
 * indefinida de propósito, por isso a presença da chave é que conta).
 */
export const preservarConferenciaLocal = (
  local?: CamposDeDecisaoDeConferencia | null
): DecisaoDeConferencia => {
  const decisao: DecisaoDeConferencia = {};
  if (!local) return decisao;
  const origem = local as Record<string, unknown>;
  const destino = decisao as Record<string, unknown>;
  for (const campo of CAMPOS_DA_DECISAO) {
    if (Object.prototype.hasOwnProperty.call(origem, campo)) destino[campo] = origem[campo];
  }
  return decisao;
};

/** «Conferido» na linha, com o mesmo predicado dos ecrãs e da nuvem. */
const decidiuConferido = (registo?: CamposDeDecisaoDeConferencia | null): boolean =>
  !!registo &&
  (isConferido(registo) || /conferido/i.test(String(registo.status ?? '')));

/**
 * A decisão de conferência do aparelho é mais recente do que a da nuvem?
 *
 * `_dataLeitura` é o momento da leitura (marcar) e `_lastUpdated` o do toque
 * (o desmarcar não tem data de leitura própria). A nuvem só tem a primeira.
 */
export const conferenciaLocalVenceNuvem = (
  local?: CamposDeDecisaoDeConferencia | null,
  nuvem?: CamposDeDecisaoDeConferencia | null
): boolean => {
  if (!local) return false;

  const leituraLocal = instante(local._dataLeitura);
  const momentoLocal = Number.isFinite(leituraLocal) ? leituraLocal : instante(local._lastUpdated);
  if (!Number.isFinite(momentoLocal)) return false;

  const leituraNuvem = instante(nuvem?._dataLeitura);
  if (Number.isFinite(leituraNuvem)) return momentoLocal > leituraNuvem;

  // A nuvem não traz data: só se preserva quando o aparelho decide algo que a
  // linha da nuvem ainda não diz — uma decisão igual não tem nada a repor.
  return decidiuConferido(local) !== decidiuConferido(nuvem);
};

/**
 * MIGRAÇÃO ÚNICA DAS GRAFIAS DE `_conferido`
 * ============================================================================
 * As bases antigas guardam a marca em todas as grafias que a regra aceita:
 * `true` (Dexie/app), `1` (carga/espelho), `'true'`/`'1'` (JSON importado) e
 * ainda há registos cuja única prova é a coluna de auditoria
 * (`AUDITOR_STATUS_CONFERENCIA = 'SIM'`). `isConferido` lê todas, mas o
 * registo continua a ser gravado como veio — e a decisão por TEMPO do pull só
 * compara datas quando as há.
 *
 * Esta passagem deixa a marca na grafia canônica (`1`, número) e garante a
 * data da leitura quando o registo já tem uma data legível — `_dataLeitura`
 * primeiro, `_lastUpdated` como contingência. NUNCA inventa «agora»: uma
 * conferência sem data não pode parecer mais recente do que a da nuvem e
 * ganhar o merge por fabrico (ver `conferenciaLocalVenceNuvem`).
 *
 * Desmarcados (`_conferido = 0`/`false`) ficam como estão: a migração só
 * normaliza a prova de conferência, não decide conferência.
 */
export interface NormalizacaoDeConferido {
  /** O registo tem prova de conferência e ainda não está na grafia canônica. */
  converter: boolean;
  /** Patch a aplicar ao registo (vazio quando não há nada a fazer). */
  patch: { _conferido?: 1; _dataLeitura?: string };
}

/** Data em texto ISO legível, ou `null` quando o campo não traz data. */
const dataLegivel = (valor: unknown): string | null => {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  return Number.isFinite(Date.parse(texto)) ? texto : null;
};

export const normalizarMarcaConferencia = (
  asset?: CamposDeDecisaoDeConferencia | null
): NormalizacaoDeConferido => {
  if (!asset || !isConferido(asset)) return { converter: false, patch: {} };

  const patch: NormalizacaoDeConferido['patch'] = {};
  if (asset._conferido !== 1) patch._conferido = 1;
  if (!dataLegivel(asset._dataLeitura)) {
    const data = dataLegivel(asset._lastUpdated);
    if (data) patch._dataLeitura = data;
  }

  return { converter: Object.keys(patch).length > 0, patch };
};

/**
 * O RELATÓRIO E A FICHA IMPRIMEM A MESMA CONFERÊNCIA DOS ECRÃS
 * ============================================================================
 * A ficha PDF do ativo lia campos que não existem no registo (`_conferidoEm`,
 * `_conferidoPor`) e imprimia «DATA AUDITORIA: PENDENTE» e «AUDITOR: NÃO
 * IDENTIFICADO**» em TODOS os cartões, incluindo os conferidos no campo — a
 * prova que sai para o cliente não mostrava quem conferiu nem quando. E a ficha
 * de impressão usava a coluna de auditoria crua como texto de conformidade:
 * um item conferido só pela flag saía a dizer «sem ressalvas» por omissão.
 *
 * Aqui a leitura é uma só, com as mesmas grafias de `isConferido`: quem confere
 * decide-se pela regra, e a data/quem só existem quando há conferência. O
 * formato (data legível) fica com quem imprime.
 */
export interface AuditoriaDoAtivo {
  conferido: boolean;
  /** Rótulo de conferência que o documento imprime. */
  situacao: 'SIM' | 'NÃO';
  /** Instante da leitura, como está no registo (ISO), ou `null`. */
  dataLeitura: string | null;
  /** Quem conferiu, ou `null` quando o registo não diz. */
  auditor: string | null;
}

export const auditoriaDoAtivo = (
  asset?: (CamposDeDecisaoDeConferencia & { _auditor?: unknown }) | null
): AuditoriaDoAtivo => {
  const conferido = !!asset && isConferido(asset);
  const auditor = conferido ? String(asset?._auditor ?? '').trim() : '';
  return {
    conferido,
    situacao: conferido ? 'SIM' : 'NÃO',
    dataLeitura: conferido ? dataLegivel(asset?._dataLeitura) : null,
    auditor: auditor || null
  };
};
