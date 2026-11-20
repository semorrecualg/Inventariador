# Faxina do repositório — ramos e PRs

Registo do item 16 da agenda sequencial (2026-11-20). A governança exige PR para
`main` e proíbe reescrever histórico; apagar um ramo é irreversível para quem só
tem o remoto, por isso a regra aqui é conservadora.

## Regra

1. **Só se apaga um ramo cujo PR está `MERGED`** — verificado com
   `gh pr list --state merged --head <ramo>`.
2. PR `CLOSED` **sem** merge não autoriza apagar: os commits não estão em `main` e
   o ramo é a única cópia.
3. PR aberto — o ramo é a fonte do PR.
4. `feat/sync-recibo-f2` **não se toca**: pertence a outro chat/trabalho.
5. Ramos `freebuff/*` são de sessões de agente; ficam para quem os abriu.

## Apagados (PR fundido)

| ramo | PR |
| --- | --- |
| `fix/ancora-coordenada-valida` | #115 |
| `fix/gps-pontes-nuvem-captura` | #116 |
| `test/sync-fundo-gps-omisso` | #117 |

## Mantidos, com o motivo

| ramo | motivo |
| --- | --- |
| `feat/bloqueio-envio-base-com-copias` | PR #113 **CLOSED sem merge**; 6 commits fora de `main` (guarda de cópias no envio) |
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
