# Faxina do repositório — ramos e PRs

Registo do item 16 da agenda sequencial (2026-11-20). A governança exige PR para
`main` e proíbe reescrever histórico; apagar um ramo é irreversível para quem só
tem o remoto, por isso a regra aqui é conservadora.

## Regra

1. **Só se apaga um ramo cujo PR está `MERGED`** — verificado com
   `gh pr list --state merged --head <ramo>`.
2. PR `CLOSED` **sem** merge não autoriza apagar — só depois de comparar a
   árvore com `main`: se o ramo não tem conteúdo que `main` não tenha
   (`git diff <merge-base> <ramo>` vazio e o merge-base está em `main`), apaga-se
   sem perda. Se tiver conteúdo único, fica.
3. PR aberto — o ramo é a fonte do PR.
4. `feat/sync-recibo-f2` **não se toca**: pertence a outro chat/trabalho.
5. Ramos `freebuff/*` são de sessões de agente; ficam para quem os abriu.

## Apagados (PR fundido)

| ramo | PR | squash em `main` |
| --- | --- | --- |
| `fix/ancora-coordenada-valida` | #115 | — |
| `fix/gps-pontes-nuvem-captura` | #116 | — |
| `test/sync-fundo-gps-omisso` | #117 | — |
| `feat/bloqueio-envio-base-com-copias` | — (sem conteúdo próprio, ver abaixo) | — |
| `feat/alerta-falha-envio` | #118 | `bf7222f` |
| `fix/pull-preserva-carimbo` | #119 | `93299c6` |
| `fix/assinatura-falha-estavel` | #120 | `3949bef` |
| `fix/fila-onconflict-primarykey` | #122 | `2e72ac2` |
| `fix/timeout-nao-e-recusa` | #123 | `209483e` |
| `fix/exclusao-vence-pendencia` | #127 | `c876420` |
| `feat/painel-completo-hub` | #134 | `21f5099` |
| `feat/falha-no-detalhe` | #121 | `b91ebcd` |
| `fix/gps-ancora-mapa-calor` | #114 | `d906950` |

As nove últimas linhas foram apagadas na segunda passagem (2026-11-20), cada uma
confirmado `MERGED` com `gh pr list --state all --head <ramo>` antes do
`gh api -X DELETE …/git/refs/heads/<ramo>`; os de #121 e #114 caíram no próprio
merge (`--delete-branch`). Estado final do remoto: `main`, `feat/sync-recibo-f2`
(de outro chat) e os ramos `freebuff/*` das sessões de agente.

`feat/bloqueio-envio-base-com-copias`: o PR #113 foi **fechado sem merge**, mas a
árvore do ramo é **idêntica** ao commit `2f69a77` («fix(conferencia): … predicado
único (#112)»), que está em `main` — `git diff 2f69a77 <ramo>` não devolve
nenhum ficheiro. `src/utils/cloudPushGuard.ts` e o seu teste são idênticos aos de
`main` (290 linhas), e a ligação aos caminhos de envio vive em `main`
(`supabaseService.ts`, `App.tsx`, `DatabaseManagerScreen.tsx`). `main` está à
frente do ramo (+3.920/−184 em 57 ficheiros), nunca atrás: apagado sem perda.

## Mantidos, com o motivo

| ramo | motivo |
| --- | --- |
| `feat/sync-recibo-f2` | trabalho de outro chat — nunca tocar |
| `freebuff/<sessão>` | ramos de sessões de agente; ficam para quem os abriu |

Não há, hoje, nenhum ramo à espera de decisão: todos os PRs foram fundidos e os
ramos apagados.

## PRs

- **#119** — já estava `MERGED`; não havia nada a fechar.
- **#121** e **#114** — fundidos depois de corrigidos contra a `main` 2.9.0: o
  #121 só conflituava no `CHANGELOG.md` (entrada reposta sob `[Unreleased]`); o
  #114 fazia merge limpo mas não compilava, por redeclarar em
  `types/inventory.ts` campos GPS que a `main` já tem (14 erros `TS2300`/
  `TS2717`) — o bloco duplicado foi removido antes do merge. Ver a agenda,
  itens 16 e 17.
