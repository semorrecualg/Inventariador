// ============================================================================
// sessionScope.ts — três desfechos distintos para uma sessão sem escopo.
//
// O boot tratava como um só o que são três casos diferentes:
//
//  1. o perfil não foi LIDO (timeout/ligação lenta) → não se sabe se tem
//     contrato. Encerrar a sessão aqui é destruir uma sessão válida;
//  2. a sessão é local do app (credencial própria) → o fail-safe da nuvem não
//     tem jurisdição sobre ela;
//  3. o perfil foi LIDO e não tem contrato nem filial → aí sim, sem escopo de
//     RLS não há o que abrir; reautenticar não muda nada.
// ============================================================================

export type DecisaoDeEscopo = 'SEGUIR' | 'LER_PERFIL_FALHOU' | 'SESSAO_LOCAL' | 'SEM_ESCOPO';

/** Sentinelas que o banco grava como texto e valem por ausência. */
const ausente = (valor?: string | null): boolean => {
  const texto = (valor ?? '').trim().toUpperCase();
  return !texto || texto === 'NULL' || texto === 'UNDEFINED';
};

export interface EntradaEscopo {
  tenantid?: string | null;
  filial?: string | null;
  ehDono: boolean;
  sessaoLocalDoApp: boolean;
  perfilIndisponivel: boolean;
}

export const decidirEscopoDeSessao = (entrada: EntradaEscopo): DecisaoDeEscopo => {
  const semEscopo = ausente(entrada.tenantid) || ausente(entrada.filial);

  if (!semEscopo || entrada.ehDono) return 'SEGUIR';
  // A ordem importa: um perfil que não foi lido não é um perfil sem escopo.
  if (entrada.perfilIndisponivel) return 'LER_PERFIL_FALHOU';
  if (entrada.sessaoLocalDoApp) return 'SESSAO_LOCAL';
  return 'SEM_ESCOPO';
};

/**
 * `true` quando o perfil devolvido é o fallback de leitura FALHADA
 * (`perfilIndisponivel`), e não um perfil realmente sem contrato.
 */
export const perfilNaoLido = (perfil: unknown): boolean =>
  typeof perfil === 'object' &&
  perfil !== null &&
  (perfil as { perfilIndisponivel?: unknown }).perfilIndisponivel === true;

/**
 * Mensagem do bloqueio por escopo. Diz o que foi LIDO (contrato/filial) porque
 * "sem contrato" sozinho não distingue coluna vazia de coluna com sentinela, e
 * sem isso o administrador corrige a base às cegas.
 */
export const mensagemContaSemContrato = (
  email: string,
  tenantid?: string | null,
  filial?: string | null
): string => {
  const lido = (valor?: string | null) => {
    const texto = (valor ?? '').trim();
    return texto ? `"${texto}"` : 'vazio';
  };
  return `A conta ${email} não tem Contrato nem Filial atribuídos na base de permissões (lido: contrato ${lido(tenantid)}, filial ${lido(filial)}). Peça ao administrador para atribuir o contrato e a filial em user_permissions — reautenticar sozinho não resolve.`;
};
