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

| ramo | PR |
| --- | --- |
| `fix/ancora-coordenada-valida` | #115 |
| `fix/gps-pontes-nuvem-captura` | #116 |
| `test/sync-fundo-gps-omisso` | #117 |
| `feat/bloqueio-envio-base-com-copias` | — (sem conteúdo próprio, ver abaixo) |

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
| `fix/gps-ancora-mapa-calor` | PR #114 aberto (guarda de conformidade pelo núcleo único de GPS) |
| `feat/falha-no-detalhe` | PR #121 aberto (selo de falha de envio e reenvio na ficha) |
| `feat/sync-recibo-f2` | trabalho de outro chat — nunca tocar |
| `fix/pull-preserva-carimbo` | PR #119 já fundido; ramo fica para uma faxina seguinte |
| `feat/alerta-falha-envio`, `fix/assinatura-falha-estavel`, `fix/exclusao-vence-pendencia`, `fix/fila-onconflict-primarykey`, `fix/timeout-nao-e-recusa`, `feat/painel-completo-hub` | PRs fundidos (#118, #120, #127, #122, #123, #134); candidatos à faxina seguinte |

## PRs

- **#119** — já estava `MERGED`; não havia nada a fechar.
- **#114** e **#121** — continuam abertos: fechar (ou fundir) exige decisão do
  dono do repositório, que a agenda também exige. Ficam à espera dessa
  autorização; nada foi fechado por iniciativa deste trabalho.
