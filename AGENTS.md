# AGENTS.md — Instruções para agentes neste repositório

Projeto: **GBR KARDEK – Inventariador** · Repositório: `github.com/semorrecualg/Inventariador` · Branch de release: `main`.

Este arquivo complementa `Inventariador-main/docs/GOVERNANCA.md`, que é a fonte de
verdade operacional. Em caso de conflito, **vence a governança**.

---

## 1. Regra de entrega: o GitHub é a fonte de verdade

O trabalho **não termina** num ficheiro editado localmente. Cada pedido concluído
tem de ficar visível no repositório remoto:

1. Trabalhar a partir de `main` atualizada (`git fetch origin` antes de começar).
2. Alterar, e **verificar** com os portões do § 4.
3. `git add` **apenas** dos ficheiros que pertencem ao pedido. Nunca arrastar
   alterações preexistentes do utilizador, ficheiros ignorados ou artefactos
   (`dist/`, `node_modules/`, zips).
4. Commit no padrão do repositório (§ 3).
5. Push para o remoto **no mesmo turno** — ramo de trabalho + Pull Request
   (§ 2). O utilizador tem de poder ver a alteração no GitHub sem pedir nada.
6. Reportar no fim: ramo, hash do commit, URL do PR e o resultado dos portões.

Nunca terminar uma tarefa com alterações só no disco. Se o push falhar, dizer
exatamente o que falhou — nunca simular sucesso nem inventar um hash.

Exceção: se o utilizador pedir explicitamente para **não** enviar, ou para
trabalhar apenas localmente, essa instrução prevalece nesse turno.

---

## 2. Fluxo git (obrigatório — governança § 5)

```
main ──▶ ramo de trabalho ──▶ commit ──▶ push ──▶ PR ──▶ CI verde ──▶ merge
```

- O PR para `main` é **obrigatório**; o merge só acontece com `ci.yml` verde.
- `main` é a única branch de release — não criar branch de produção paralela.
- Nomes de ramo sugeridos: `agent/<escopo-curto>` ou `fix/<escopo>`,
  `feat/<escopo>`, `docs/<escopo>`.
- `git commit --no-verify` e `git push --no-verify` são **proibidos**.
- Sem `rebase`/`reset`/`clean` destrutivos, sem reescrever histórico, sem force-push.
- Nunca commitar segredos (§ 5).

## 3. Mensagens de commit

Padrão já usado no repositório, em português, imperativo, sem ponto final:

```
feat(escopo): descrição curta
fix(escopo): descrição curta
docs(escopo): descrição curta
chore(escopo): descrição curta
```

## 4. Portões de qualidade (verdes antes de abrir PR)

Executar dentro de `Inventariador-main/` (Node do `.nvmrc`, ≥ 22):

| Comando | Esperado |
|---|---|
| `npm run lint` | 0 erros, 0 warnings |
| `npx tsc --noEmit` | 0 erros |
| `npm test` | suíte unitária verde (Vitest) |
| `npm run build` | `dist/` gerado |

- Só correr os portões que o pedido justifica; em alterações de código, no mínimo
  `lint` + `tsc`.
- Corrigir a causa de uma falha. É proibido mascarar com `eslint-disable`,
  `@ts-ignore`, asserções enfraquecidas ou saltar testes para "ficar verde".
- Os hooks Husky (`.husky/pre-commit` = lint + tsc, `pre-push` = build) podem não
  estar instalados neste ambiente; mesmo assim os portões são obrigatórios — o CI
  reproduz exatamente os mesmos comandos.

## 5. Segredos

- `.env` e `.env.local` **nunca** são lidos, impressos ou commitados.
  Versionados: `.env.example` (template) e `.env.test` (só `VITE_ADMIN_EMAIL`).
- `service_role` e `GEMINI_API_KEY` jamais em variáveis `VITE_*`.
- Faltando uma credencial, indicar o nome da chave e pedir ao utilizador que a
  adicione nos Secrets — nunca colar valores em código, commits ou mensagens.

## 6. Topologia (não alterar sem tarefa dedicada)

```
Inventariador/                 ← raiz do repositório git (este AGENTS.md)
├── .nvmrc · .github/workflows/{ci,android-build}.yml
└── Inventariador-main/        ← raiz do APP (package.json, vite, src, docs)
```

O app é **subdiretório** do repositório: é isso que os dois workflows e o
`vercel.json` assumem. Não mover para a raiz; não criar `package.json` na raiz.
