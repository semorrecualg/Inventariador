// ============================================================================
// mirrorScope.ts — que linhas da base local podem subir para a nuvem.
//
// O espelhamento em massa é a única porta pela qual a base de um aparelho chega
// a `assets` no Supabase, e o cache local pode conter mais de um contrato (ex.:
// sobrou um CICOPAL de uma sessão anterior e o utilizador agora é de outro
// cliente). Enviar "a base inteira" nesse caso mistura contratos na nuvem.
//
// A regra aqui é deliberadamente conservadora: só sai do aparelho o que tem UM
// contrato identificado. Sem contrato ativo e com mais de um contrato na base,
// nada é enviado — quem decide é o utilizador, escolhendo o contrato.
// ============================================================================

/** Marcas que não são contratos: linhas sem contrato nunca vão para a nuvem. */
const SEM_CONTRATO = new Set(['', 'UNDEFINED', 'NULL']);

const normalizarContrato = (valor: unknown): string =>
  String(valor ?? '').trim().toUpperCase();

export interface MirrorScopeOk {
  ok: true;
  /** Linhas prontas para envio: todas do contrato resolvido. */
  rows: Record<string, unknown>[];
  /** Contrato a que o envio fica preso (`tenantid` do upsert). */
  tenant: string;
  /** Linhas deixadas de fora por não terem contrato. */
  ignoradas: number;
}

export interface MirrorScopeErro {
  ok: false;
  reason: 'vazia' | 'vazio-no-contrato' | 'multi-contrato' | 'sem-contrato';
  message: string;
  contratos: string[];
}

export type MirrorScope = MirrorScopeOk | MirrorScopeErro;

/** Contratos presentes na base, já normalizados e sem marcas vazias. */
export const contratosDaBase = (ativos: Record<string, unknown>[]): string[] => [
  ...new Set(
    ativos
      .map((a) => normalizarContrato(a.tenantid))
      .filter((t) => !SEM_CONTRATO.has(t))
  )
];

/**
 * Decide o âmbito do espelhamento.
 *
 * @param ativos base local inteira (todos os espelhos já unificados)
 * @param contratoAtivo `tenantid` do utilizador logado; vazio para dono/global
 */
export const resolverEscopoEspelhamento = (
  ativos: Record<string, unknown>[],
  contratoAtivo: string
): MirrorScope => {
  const contrato = normalizarContrato(contratoAtivo);
  const contratos = contratosDaBase(ativos);

  if (ativos.length === 0) {
    return {
      ok: false,
      reason: 'vazia',
      message: 'A base local está vazia: não há nada para espelhar.',
      contratos
    };
  }

  if (contrato) {
    // ISOLAMENTO: só o contrato do utilizador. O que for de outro contrato
    // (cache antigo) fica no aparelho e nunca sobe por esta sessão.
    const rows = ativos.filter((a) => normalizarContrato(a.tenantid) === contrato);
    if (rows.length === 0) {
      return {
        ok: false,
        reason: 'vazio-no-contrato',
        message: `Nenhum ativo do contrato ${contrato} na base local: nada enviado.`,
        contratos
      };
    }
    return { ok: true, rows, tenant: contrato, ignoradas: 0 };
  }

  // Sem contrato ativo só se aceita uma base de contrato único: enviar vários
  // contratos de uma vez é exactamente a mistura que o isolamento proíbe.
  if (contratos.length === 0) {
    return {
      ok: false,
      reason: 'sem-contrato',
      message: 'Nenhum contrato identificado na base local: selecione o contrato antes de espelhar.',
      contratos
    };
  }
  if (contratos.length > 1) {
    return {
      ok: false,
      reason: 'multi-contrato',
      message: `A base local mistura ${contratos.length} contratos (${contratos.join(', ')}): selecione um contrato antes de espelhar.`,
      contratos
    };
  }

  const [unico] = contratos;
  const rows = ativos.filter((a) => normalizarContrato(a.tenantid) === unico);
  return { ok: true, rows, tenant: unico, ignoradas: ativos.length - rows.length };
};
