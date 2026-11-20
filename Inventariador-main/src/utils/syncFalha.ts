/**
 * FALHA DE ENVIO VISÍVEL NO APARELHO
 * ============================================================================
 * «Pendente Nuvem» diz que o registo está fora da nuvem, não *porquê*. Um ativo
 * que a nuvem recusou (RLS, coluna inexistente, sessão inválida) e um ativo que
 * só ainda não teve a sua vez de subir apareciam exactamente iguais no cartão —
 * e o operador não tinha como saber se devia esperar ou agir.
 *
 * A recusa já ficava em `audit_logs` (`SYNC_RECORD_FAIL` /
 * `SYNC_RECORD_EXCEPTION`), longe do ativo e num separador diferente. Este
 * módulo carimba o próprio registo local com a última recusa, para o cartão e o
 * botão global a poderem mostrar sem consultar a trilha.
 *
 * O carimbo é apagado no sucesso (`markRecordSynced`): é a mesma flag
 * `_is_synced` que deixa de estar a 0, por isso o aviso não sobrevive ao envio.
 */
import { formatPendingAge } from './syncBadge';

/**
 * Intervalo mínimo entre dois carimbos do mesmo registo.
 *
 * O ciclo de fundo corre a cada 60 s. Sem este limite, um ativo preso com o
 * mesmo erro reescrevia o registo local 1.440 vezes por dia (e cada escrita
 * acorda o contador do selo, que lê `local_assets` a cada 5 s).
 */
export const SYNC_FAILURE_STAMP_WINDOW_MS = 10 * 60 * 1000;

/** Tamanho máximo do motivo guardado no registo (o detalhe completo fica na trilha). */
const MOTIVO_MAX = 90;

export interface SyncFailureStamp {
  /** Data da última tentativa recusada (ISO). */
  _syncFailAt: string;
  /** Motivo curto da recusa, para o selo do cartão. */
  _syncFailReason: string;
}

export interface SyncFailureInfo {
  motivo: string;
  /** Texto curto (ex.: «há 5 min») ou null quando o carimbo não tem data legível. */
  idade: string | null;
}

/** Um motivo numa linha só, curto o suficiente para o selo do cartão. */
export const resumirMotivoFalha = (motivo: string): string => {
  const limpo = String(motivo ?? '').replace(/\s+/g, ' ').trim();
  if (!limpo) return 'erro sem detalhe';
  if (limpo.length <= MOTIVO_MAX) return limpo;
  return `${limpo.slice(0, MOTIVO_MAX - 1).trimEnd()}…`;
};

/**
 * ASSINATURA ESTÁVEL DE UMA RECUSA
 * ============================================================================
 * A trilha deduplica as recusas de envio por `primarykey|detalhe` dentro de uma
 * janela de 10 min (`syncService.auditSyncRecordFailure`). Se o detalhe trouxer
 * texto que muda entre tentativas — id de pedido, UUID, data/hora, ficheiro e
 * linha da pilha —, a MESMA recusa volta a ser registada em cada ciclo e a
 * janela perde o efeito: `audit_logs` enche-se outra vez com a mesma causa.
 *
 * A assinatura guarda o que identifica a causa (código de erro e mensagem) e
 * troca o resto por marcadores fixos. Duas mensagens do mesmo erro com ids
 * diferentes dão a mesma assinatura; dois erros diferentes continuam distintos.
 */
export const SYNC_FAILURE_SIGNATURE_MAX = 160;

/** Fragmentos que mudam entre tentativas do mesmo erro. */
const MARCADORES_DE_FALHA: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
  [/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)?Z?\b/g, '<data>'],
  [/\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\b/g, '<hora>'],
  [/\b[\w./-]+\.(?:tsx?|jsx?|mjs|cjs):\d+(?::\d+)?/g, '<origem>'],
  [/\b0x[0-9a-f]+\b/gi, '<hex>'],
  // Id de pedido («req 42», «pedido #7»): muda a cada tentativa, não é a causa.
  // A regra dos números de 6+ dígitos não o apanhava e cada ciclo reabria a
  // janela — 100 ciclos do mesmo erro davam 100 linhas.
  [/\b(?:req|request|pedido)\s*#?\s*\d+\b/gi, '<pedido>'],
  [/\b\d{6,}\b/g, '<numero>'],
  [/\b\d+(?:[.,]\d+)?\s?(?:ms|s)\b/g, '<duracao>']
];

/** Texto estável do detalhe: sem pilha, sem ids, sem carimbos de tempo. */
export const normalizarDetalheFalha = (details: string): string => {
  // Só a primeira linha: uma pilha (`at fn (ficheiro:12:3)`) muda sempre.
  const primeiraLinha = String(details ?? '')
    .split(/\r?\n/, 1)[0]
    // eslint-disable-next-line no-control-regex -- ANSI de logs coloridos
    .replace(/\u001b\[[0-9;]*[mK]/g, ' ');

  let texto = primeiraLinha;
  for (const [padrao, marcador] of MARCADORES_DE_FALHA) texto = texto.replace(padrao, marcador);

  return texto.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, SYNC_FAILURE_SIGNATURE_MAX);
};

/**
 * TETO DAS LINHAS DE FALHA PRESERVADAS — UMA POR DIA
 * ============================================================================
 * As recusas de envio ficaram fora do expurgo de 7 dias (são a prova de por que
 * um ativo não subiu), mas a janela de deduplicação era de 10 min: um ativo
 * preso com o mesmo erro voltava a escrever uma linha a cada janela — 144 por
 * dia, para sempre, e a trilha «preservada» crescia até tapar o diagnóstico que
 * ela própria serve para fazer.
 *
 * A janela passa a ser o DIA (UTC): a mesma assinatura (`primarykey|erro
 * estável`) escreve no máximo uma linha por dia. O dia seguinte é uma linha
 * nova — a falha continua visível enquanto durar, sem repetir o mesmo dia.
 * E o expurgo colapsa o histórico já gravado (as 144 linhas diárias de antes)
 * na mais recente de cada dia.
 */
export const inicioDoDiaDaFalha = (agora: number = Date.now()): string => {
  const d = new Date(agora);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
};

/** Linha da trilha com o que a agregação lê. */
export interface LinhaDeFalhaNaTrilha {
  id: string;
  acao?: unknown;
  registro_id?: unknown;
  delta?: unknown;
  details?: unknown;
  updated_at?: unknown;
}

/** Dia (UTC, `YYYY-MM-DD`) da linha — a chave do teto. */
export const diaDaFalhaNaTrilha = (updatedAt: unknown): string | null => {
  const texto = String(updatedAt ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : null;
};

/**
 * Assinatura que a linha guarda — a do `delta`, ou (linhas antigas, gravadas
 * antes de o `delta` existir) o detalhe normalizado. `null` quando a linha não
 * diz qual foi a falha: sem assinatura não há como agregar, e ela não é tocada.
 */
export const assinaturaDaTrilha = (linha: LinhaDeFalhaNaTrilha): string | null => {
  try {
    const delta = JSON.parse(String(linha.delta ?? '{}')) as { signature?: unknown };
    if (typeof delta.signature === 'string' && delta.signature) {
      const corte = delta.signature.indexOf('|');
      return corte === -1
        ? delta.signature
        : assinaturaDeFalha(delta.signature.slice(0, corte), delta.signature.slice(corte + 1));
    }
  } catch {
    // delta ilegível: cai no detalhe.
  }
  const detalhe = normalizarDetalheFalha(String(linha.details ?? ''));
  return detalhe ? assinaturaDeFalha(String(linha.registro_id ?? ''), detalhe) : null;
};

/** Chave do teto: ação | registo | dia | assinatura. */
export const chaveDeFalhaNoDia = (linha: LinhaDeFalhaNaTrilha): string | null => {
  const dia = diaDaFalhaNaTrilha(linha.updated_at);
  const assinatura = assinaturaDaTrilha(linha);
  if (!dia || !assinatura) return null;
  return `${String(linha.acao ?? '').toUpperCase()}|${String(linha.registro_id ?? '')}|${dia}|${assinatura}`;
};

/**
 * Ids das linhas de falha REPETIDAS — tudo o que excede a mais recente de cada
 * `chaveDeFalhaNoDia`. É a limpeza do histórico anterior ao teto (144 linhas
 * por dia do mesmo erro passam a 1) e não toca no que não é falha de envio.
 */
export const idsDeFalhasRepetidas = (linhas: readonly LinhaDeFalhaNaTrilha[]): string[] => {
  const ultimaPorChave = new Map<string, { id: string; instante: number }>();
  const repetidas: string[] = [];

  for (const linha of linhas) {
    const chave = chaveDeFalhaNoDia(linha);
    if (!chave) continue;
    const instante = Date.parse(String(linha.updated_at ?? ''));
    const anterior = ultimaPorChave.get(chave);
    if (!anterior) {
      ultimaPorChave.set(chave, { id: linha.id, instante });
      continue;
    }
    const novaGanha = instante > anterior.instante || (instante === anterior.instante && linha.id > anterior.id);
    if (novaGanha) {
      repetidas.push(anterior.id);
      ultimaPorChave.set(chave, { id: linha.id, instante });
    } else {
      repetidas.push(linha.id);
    }
  }

  return repetidas;
};

/** Chave de deduplicação de uma recusa: `primarykey|detalhe estável`. */
export const assinaturaDeFalha = (primaryKey: string, details: string): string =>
  `${String(primaryKey ?? '').trim()}|${normalizarDetalheFalha(details)}`;

/**
 * Carimbo a gravar — ou `null` quando não vale a pena reescrever o registo.
 *
 * Não reescreve quando a última tentativa foi há menos de
 * `SYNC_FAILURE_STAMP_WINDOW_MS` com o mesmo motivo; um motivo diferente é
 * sempre registado, porque é informação nova para o operador. A idade mostrada
 * é a da última tentativa conhecida, que pode ter até uma janela de atraso.
 */
export const carimbarFalhaEnvio = (
  actual: { _syncFailAt?: unknown; _syncFailReason?: unknown } | null | undefined,
  motivo: string,
  agora: number = Date.now()
): SyncFailureStamp | null => {
  const motivoNovo = resumirMotivoFalha(motivo);
  const anterior = actual?._syncFailAt ? new Date(String(actual._syncFailAt)).getTime() : NaN;
  const dentroDaJanela = Number.isFinite(anterior) && agora - anterior < SYNC_FAILURE_STAMP_WINDOW_MS;
  const mesmoMotivo = String(actual?._syncFailReason ?? '') === motivoNovo;

  if (dentroDaJanela && mesmoMotivo) return null;
  return { _syncFailAt: new Date(agora).toISOString(), _syncFailReason: motivoNovo };
};

/**
 * ESTADO DE UM REGISTO QUE A NUVEM JÁ ACEITOU — UMA SÓ REGRA
 * ============================================================================
 * `_is_synced = 1` («esta linha é igual à nuvem») e `_syncFailAt` («a nuvem
 * recusou este registo») são estados que se excluem. Quem marca o sucesso tem
 * de apagar o carimbo na mesma escrita; senão o carimbo fica órfão num registo
 * sincronizado e volta a pintar o selo no primeiro toque que reponha
 * `_is_synced = 0` — uma recusa antiga a fingir de nova.
 *
 * O patch vive aqui (uma regra só) e é usado pelas escritas de sucesso:
 * `sqliteService.markAssetsSynced` (envio em massa, fila e fotos) e o estado
 * visual do App que espelha o que a nuvem aceitou.
 */
export interface MarcaSincronizada {
  _is_synced: 1;
}

export const marcarSincronizadoLocal = <T extends object>(asset: T): T & MarcaSincronizada => {
  const copia = { ...asset } as Record<string, unknown>;
  delete copia._syncFailAt;
  delete copia._syncFailReason;
  copia._is_synced = 1;
  return copia as T & MarcaSincronizada;
};

/**
 * Motivo e idade para o selo do cartão. Sem carimbo não há aviso — um registo
 * só na fila continua a ser «Pendente Nuvem» sem falha nenhuma a declarar.
 *
 * `_is_synced = 1` continua a calar um carimbo legado (bases gravadas antes de
 * a limpeza passar a ser feita na própria escrita do sucesso): um selo vermelho
 * num registo igual à nuvem seria falso.
 */
export const syncFailureInfo = (
  asset: { _syncFailAt?: unknown; _syncFailReason?: unknown; _is_synced?: unknown } | null | undefined,
  now: number = Date.now()
): SyncFailureInfo | null => {
  if (!asset?._syncFailAt) return null;
  if (Number(asset._is_synced) === 1) return null;

  const motivo = String(asset._syncFailReason ?? '').trim();
  return {
    motivo: motivo || 'erro sem detalhe',
    idade: formatPendingAge(String(asset._syncFailAt), now)
  };
};
