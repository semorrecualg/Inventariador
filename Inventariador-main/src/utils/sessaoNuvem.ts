/**
 * «O ENVIO CHEGOU COMO `anon`» — 42501 com o utilizador autenticado na app
 * ============================================================================
 * O app tem sessões que NÃO têm token do Supabase. Os ecrãs de login aceitam a
 * credencial local (Dexie, «Barreira Local», biometria) e regressam ANTES do
 * `signInWithPassword` — a sessão fica com a marca APP (`markAppManagedSession`)
 * e sem token. É o desenho offline-first, e está certo para trabalhar sem rede;
 * o que não pode acontecer é esse estado continuar a enviar para a nuvem.
 *
 * O portão do envio (`canPushToCloud`) só olha para o aparelho, para o modo de
 * base e para a blindagem — nunca para a sessão. Sem token, o supabase-js envia
 * apenas a `apikey` e o PostgREST resolve o pedido com o papel `anon`.
 * Depois do endurecimento de RLS (assets só para `authenticated`), esse pedido
 * recebe `42501 permission denied for table assets` — a mensagem que o cartão
 * mostrava como se fosse falta de GRANT na nuvem.
 *
 * Aqui vive a leitura dessa recusa: `estadoDaSessaoNuvem` (em
 * `services/supabaseService`) diz se há sessão e `mensagemDeRecusa42501`
 * transforma o código no que o operador precisa de fazer — entrar de novo com a
 * senha da nuvem, e não abrir a tabela a `anon` outra vez.
 */

/**
 * `autenticada` — há um access token (o pedido chegou como `authenticated`);
 * `ausente` — não há sessão (o pedido chegou como `anon`);
 * `indeterminado` — não foi possível perguntar (cliente stub, tempo esgotado).
 */
export type EstadoSessaoNuvem = 'autenticada' | 'ausente' | 'indeterminado';

/** Limite do motivo curto guardado no registo (`utils/syncFalha`). */
export const MOTIVO_CURTO_MAX = 90;

/**
 * A ação que resolve o 42501 de sessão ausente. É a mesma no aviso da barra de
 * sincronização e no `SessaoNuvemAusenteError`: sair e entrar com a credencial
 * da nuvem — nunca abrir a tabela a `anon`.
 */
export const MENSAGEM_SESSAO_AUSENTE =
  'Sem sessão da nuvem neste aparelho — saia e entre com e-mail e senha para enviar.';

/**
 * O login por credencial local tem de abrir também a sessão do Supabase?
 *
 * Só em Base Oficial (build com credenciais e modo não `INTERNAL`) e com rede:
 * em Base Local a nuvem está desligada por desenho e sem rede não há a quem
 * pedir o token. Fora destes casos o login fica exatamente como era.
 */
export const deveAbrirSessaoNuvemNoLogin = (opcoes: {
  temCredenciaisDoBuild: boolean;
  modoBase?: string | null;
  online: boolean;
}): boolean =>
  opcoes.temCredenciaisDoBuild &&
  opcoes.online &&
  !String(opcoes.modoBase ?? '').startsWith('INTERNAL');

/**
 * Classificação pura da sessão: o que interessa ao diagnóstico é existir um
 * access token. Um objecto de sessão sem token não autentica nada.
 */
export const classificarSessao = (
  session: { access_token?: string | null } | null | undefined
): EstadoSessaoNuvem => (session?.access_token ? 'autenticada' : 'ausente');

/**
 * Texto do carimbo para um `42501`, conforme o papel com que o pedido chegou.
 *
 * O Postgres usa o MESMO código para duas coisas diferentes:
 *  - «permission denied for table assets» → falta de privilégio de tabela para
 *    o papel do pedido (`anon` quando não há sessão);
 *  - «new row violates row-level security policy» → a política recusou a linha
 *    (há sessão, mas o contrato/perfil não alcança aquela linha).
 * O motivo antigo juntava as duas e mandava o operador abrir a tabela a `anon`.
 *
 * `original` é a mensagem do PostgREST e vai no fim do detalhe (a trilha guarda
 * o texto completo; o selo do cartão corta aos 90 caracteres).
 */
export const mensagemDeRecusa42501 = (
  estado: EstadoSessaoNuvem,
  original?: string | null
): string => {
  const texto = String(original ?? '').trim();

  // A política recusou a linha: o problema é de dados/contrato, não de papel.
  // O «row-level security» fica no texto (é o que distingue o erro na trilha e
  // no cartão); só a leitura muda conforme haja ou não sessão.
  if (/row-level security/i.test(texto)) {
    return estado === 'ausente'
      ? 'Erro Supabase: [42501] RLS sem sessão — entre de novo · row-level security'
      : 'Erro Supabase: [42501] política de RLS recusou a linha · row-level security';
  }

  const detalhe = texto ? ` · ${texto}` : '';

  if (estado === 'ausente') {
    return `Erro Supabase: [42501] pedido chegou como anon (sem sessão) — entre de novo${detalhe}`;
  }
  if (estado === 'autenticada') {
    return `Erro Supabase: [42501] sessão válida — falta o GRANT em assets${detalhe}`;
  }
  return `Erro Supabase: [42501] recusa de privilégio — confirme a sessão da nuvem${detalhe}`;
};

/**
 * `true` quando o motivo já explica o papel do pedido — o cartão não volta a
 * ler «permission denied» como se fosse só uma permissão em falta na nuvem.
 */
export const explicaPapelAnon = (motivo: string): boolean =>
  /pedido chegou como anon|RLS sem sessão/i.test(String(motivo ?? ''));

/** Texto curto do cartão e do aviso quando o envio aguarda uma sessão. */
export const MENSAGEM_ESPERA_SESSAO =
  'À espera de sessão — entre com e-mail e senha para enviar.';

/**
 * O MOTIVO É FALTA DE SESSÃO, NÃO UMA RECUSA DE DADOS
 * ============================================================================
 * Sem token do Supabase o pedido chega como `anon` e o PostgREST responde
 * 42501 — não é a política a recusar a linha nem o registo a estar errado: é o
 * aparelho que ainda não tem sessão. Esses registos continuam pendentes (nada
 * se perdeu) e o cartão deve dizê-lo assim, em vez de pintar uma «Falha de
 * envio» que sugere dados recusados. O motivo guardado por ciclos anteriores é
 * reconhecido aqui para o selo antigo também passar a ler-se como espera.
 */
export const pareceFaltaDeSessao = (motivo: string | null | undefined): boolean =>
  /sem sessão|chegou como anon|rls sem sessão/i.test(String(motivo ?? ''));
