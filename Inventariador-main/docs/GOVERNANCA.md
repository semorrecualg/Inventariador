# Governança — Ambiente Local ↔ GitHub ↔ Supabase

> **Documento único** de governança operacional do GBR KARDEK – Inventariador.
> Responde a três perguntas: **onde o código vive**, **como ele chega ao GitHub** e
> **como ele fala com o Supabase**.
>
> **Última verificação:** 2026-11-02 · **App:** v2.6.0 · **Baseline local:** Dexie v7
> Complementa (não substitui) `SPEC.md`, `ARCHITECTURE.md`, `RBAC_GOVERNANCA.md` e
> `SCHEMA_BASELINE.md` — ver § 11.

---

## 1. Fonte única de verdade

| Item | Fonte canônica | Regra |
|---|---|---|
| Código | `github.com/semorrecualg/Inventariador` · branch `main` | Nenhuma cópia paralela. O diretório local de trabalho é `E:\Inventariador_11_2026\Inventariador` |
| Versão | `Inventariador-main/package.json` → `version` | Nenhum outro arquivo chumbra versão. Workflows leem daqui |
| Runtime | `.nvmrc` (Node 22) + `engines` no `package.json` | CI e dev usam a mesma major (Node 20 chegou ao EOL em 2026-04; jsdom 30 + undici do lockfile exigem Node ≥ 22) |
| Variáveis | `.env.example` (template) / `.env` (local, gitignored) | Ver § 3 |
| Schema local | `docs/SCHEMA_BASELINE.md` (Dexie v7) | Congelado; `schemaBaseline.test.ts` quebra se mudar |
| Schema nuvem | `docs/supabase_bootstrap.sql` | Idempotente; é o único DDL autorizado |
| Papéis e permissões | `docs/RBAC_GOVERNANCA.md` + `src/services/rbacService.ts` | RBAC é código, não configuração de banco |
| Qualidade | `.github/workflows/ci.yml` | É o portão real: nada entra em `main` vermelho |
| **Este documento** | `docs/GOVERNANCA.md` | Índice e regras dos três elos |

---

## 2. Topologia do repositório

```
Inventariador/                  ← raiz do repositório git
├── .nvmrc                      ← Node 22 (lido pelo CI)
├── .github/workflows/
│   ├── ci.yml                  ← gate de qualidade (lint · tipos · testes · build)
│   └── android-build.yml       ← APK debug (Capacitor)
└── Inventariador-main/         ← raiz do APP (package.json, vite, src, docs)
```

**O app é um subdiretório do repositório.** Isso é intencional e assumido pelos
dois workflows (`defaults.run.working-directory: Inventariador-main`) e pelo
`vercel.json` dentro de `Inventariador-main/`.

> ⚠️ **Não mova o app para a raiz** sem uma tarefa dedicada: são ~330 arquivos e
> quebra CI, APK, Vercel e metade dos links de documentação. O achatamento só vale
> com PR único e janela de release.

Arquivos na **raiz do app** (`Inventariador-main/`): `.env.example`, `.env.test`
(versionado), `dist/` e `node_modules/` (ignorados). Qualquer `package.json` novo
na raiz do repositório é erro — os órfãos herdados foram removidos.

---

## 3. Ambientes e variáveis

| Variável | Local (`.env`) | CI (`ci.yml`) | APK (`android-build`) | Vercel | Segredo? |
|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | obrigatória p/ modo nuvem | secret → build | secret | env do projeto | publishable |
| `VITE_SUPABASE_ANON_KEY` | obrigatória p/ modo nuvem | secret → build | secret | env do projeto | **publishable** |
| `VITE_SUPABASE_SCHEMA` | `public` | default | default | default | não |
| `VITE_ADMIN_EMAIL` | obrigatória | `vars` (fallback `semorr@gmail.com`) | idem | idem | não |
| `VITE_ENVIRONMENT` | `development` / `production` | default | default | `production` | não |
| `VITE_PROTHEUS_API_URL` | opcional | — | — | — | não |
| `GEMINI_API_KEY` | opcional, **sem** prefixo `VITE_` | secret | — | server-side | **sim** |

**Modo do banco** é derivado, nunca configurado à mão:
`isInternalMode = !(VITE_SUPABASE_URL && VITE_SUPABASE_ANON_KEY)`.
Sem as duas → **INTERNAL** (100% offline). Presentes → **SUPABASE**.

> Consequência prática: um build sem credenciais é *silenciosamente offline*.
> Por isso o `verify:governanca` (§ 8) e o checklist de release (§ 9) existem.

Arquivos de ambiente:

| Arquivo | Versionado | Conteúdo |
|---|---|---|
| `.env.example` | **sim** | template; chave publishable (`sb_publishable_...`) |
| `.env` / `.env.local` | **não** | configuração real da máquina |
| `.env.test` | **sim** | apenas `VITE_ADMIN_EMAIL` — ver § 6 |

---

## 4. Política de segredos

1. **Publishable** (pode aparecer no bundle): `VITE_SUPABASE_URL`, a chave do app —
   **publishable key** `sb_publishable_...` (formato atual) ou anon key JWT (projetos
   antigos) — e `VITE_ADMIN_EMAIL`. Ela é pública por design do Supabase; a proteção
   real é **RLS** (§ 7).
2. **Secret** (nunca no cliente, nunca em `VITE_*`): `service_role`, `GEMINI_API_KEY`,
   senhas, tokens de CI. Vai em *Settings → Secrets* (GitHub/Vercel) ou no `.env` local.
3. `service_role` **jamais** em variável `VITE_*`: tudo que tem esse prefixo é embutido
   no JS público. Uma `service_role` no front = banco inteiro exposto.
4. Rotação: trocar a chave no painel → atualizar secrets do GitHub/Vercel → `npm run
   verify:governanca` → um build de validação. Nunca rotacione sem os dois lados.
5. `.env` nunca é commitado. O `.gitignore` da raiz bloqueia `.env` e `.env.*`,
   com exceção explícita de `Inventariador-main/.env.test` (sem segredos).

---

## 5. Fluxo de trabalho no git

```
dev local ──commit──▶ branch ──PR──▶ CI verde ──merge──▶ main ──▶ Vercel
                                                     └──▶ APK só sob demanda (§ 9.1)
```

1. Branch de trabalho a partir de `main` atualizada (`git fetch` antes).
2. Commits no padrão já usado no repositório: `feat(escopo):`, `fix(escopo):`,
   `docs(escopo):`, `chore(escopo):` — em português, imperativo, sem ponto final.
3. **PR obrigatório** para `main`. O merge só acontece com `ci.yml` verde.
4. O hook `pre-commit` (Husky) roda `npm run lint` + `npx tsc --noEmit` e bloqueia
   mascaramento (`eslint-disable`, `@ts-ignore`), SQL bruto no diff e
   `window.location.reload(`.
   **`git commit --no-verify` é proibido.** Ele foi a causa dos 7 erros de lint que
   chegaram em `main` antes da Fase B; o CI agora reproduz o mesmo comando, então
   burlar o hook só transfere o vermelho para o PR.
5. `main` é a única branch de release. Não existe branch de produção paralela.

---

## 6. Portões de qualidade

Obrigatório estar verde **localmente e no CI** antes de abrir PR:

| Comando | Esperado |
|---|---|
| `npm run lint` | 0 erros, 0 warnings (`--max-warnings 0`) |
| `npx tsc --noEmit` | 0 erros |
| `npm test` | **366 testes / 36 arquivos** verdes |
| `npm run build` | `dist/` gerado, PWA com 28 entradas de precache |

### Suíte hermética (importante)

`src/services/rbacService.ts` captura `VITE_ADMIN_EMAIL` **no load do módulo**
(`const OWNER_EMAIL = ...`), antes de qualquer `vi.stubEnv`. Sem valor, os testes de
soberania do proprietário caem (`rbacService`, `routingTenantIsolation`).

Por isso **`Inventariador-main/.env.test` é versionado** com apenas
`VITE_ADMIN_EMAIL=semorr@gmail.com` — o Vite o carrega no modo `test`.

> Regra: todo teste novo que dependa de configuração de ambiente usa `.env.test`.
> **Nunca** resolva isso com `eslint-disable` nem com `process.env` espalhado.

---

## 7. Supabase — conexão e uso

**Projeto de referência:** `mpulmonxbcpqjxouzvuc` · `https://mpulmonxbcpqjxouzvuc.supabase.co`

### 7.1 Estado atual (2026-11-02) — conectado

Projeto ativo e verificado: DNS resolve, `AUTH /health` responde `200` e as quatro
tabelas essenciais (`assets`, `user_permissions`, `inventory_config`, `audit_logs`)
respondem `200` para a chave do app.

**Formato da chave:** este projeto usa a **publishable key** (`sb_publishable_...`),
o formato novo do Supabase que substituiu a anon key JWT. Ela vai no campo
`VITE_SUPABASE_ANON_KEY` (o nome da variável foi mantido para não quebrar builds) e
continua sendo pública por design. A **secret key** (`sb_secret_...`) / `service_role`
nunca entra em variável `VITE_*`.

> Histórico: o projeto anterior (`celiuyaycrnrhjuodydl`) morreu — `NXDOMAIN` em DNS
> público. Se algum ambiente (Vercel, secrets do GitHub, máquina de outro dev) ainda
> apontar para ele, corrija antes de investigar sintomas de login.

### 7.2 Como reconectar (runbook)

1. Criar/restaurar o projeto no painel do Supabase e anotar **URL + chave do app**
   (Project Settings → API Keys: use a **publishable key**, `sb_publishable_...`;
   a anon key JWT ainda funciona em projetos antigos).
2. Atualizar `Inventariador-main/.env.example` (template) e o `.env` local.
3. Rodar `docs/supabase_bootstrap.sql` no SQL Editor (idempotente).
4. Conferir tabelas: `assets`, `user_permissions`, `inventory_config`, `audit_logs`,
   `tenants`, `filial`. Se houver legado incompatível, ver cabeçalho do bootstrap.
5. Cadastrar `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` em *GitHub → Settings →
   Secrets* (usados pelo `android-build.yml`) e nas envs da Vercel.
6. Rodar `npm run verify:governanca` (§ 8) e fazer um login real de teste.

### 7.3 Uso e limites

- **Multi-tenant:** todo dado é escopado por `tenantid` (+ `filial`). Upsert de
  ativos usa `onConflict('tenantid, id')` — nunca `id` sozinho.
- **RBAC é do app** (`rbacService.ts`); a nuvem não decide papel.
- **RLS:** o bootstrap cria políticas permissivas (`p_all`). Isso é aceitável para
  MVP, **não** para multi-cliente real. Hardening pendente: escopo por `tenantid`
  derivado do JWT (`auth.jwt() ->> 'tenantid'`). Enquanto permissivo, a anon key
  permite leitura ampla — trate como risco aberto.
- **Migrações:** apenas os `scripts/*.sql` versionados, sempre idempotentes e com
  backup/export antes. `DROP TABLE` só com backup e aviso no PR.
- **Backup:** exportar pelo painel (Database → Backups) antes de qualquer DDL e
  antes de releases que mudem schema.

---

## 8. Verificação automatizada

```bash
npm run verify:governanca              # git + env + Supabase (rede)
npm run verify:governanca -- --offline # só git + env (uso em modo INTERNAL)
npm run verify:governanca -- --use-example  # testa o host do .env.example
```

Checa, em sequência: estrutura do repo → branch/limpeza/fast-forward vs `origin/main`
→ presença das variáveis → REST + AUTH do Supabase → tabelas essenciais.
**Nunca imprime valores de chaves**, apenas presença.

Saída: `0` = governança íntegra · `1` = pelo menos uma falha (com o motivo).

Quando rodar: onboarding de máquina, antes de release, após trocar credenciais e
depois de qualquer mudança de infraestrutura. **Não** é step do CI por depender de
rede e de secrets — o CI garante o código; este script garante o **ambiente**.

---

## 9. Checklist de release

1. `git fetch` + `git switch main` + `git pull --ff-only`.
2. `npm ci --legacy-peer-deps`.
3. `npm run lint` · `npx tsc --noEmit` · `npm test` · `npm run build` — todos verdes.
4. `npm run verify:governanca` — sem falhas.
5. Versão em `package.json` + entrada no `CHANGELOG.md` (Keep a Changelog).
6. PR com CI verde → merge em `main`.
7. Deploy Vercel a partir do merge; **APK só sob demanda** (§ 9.1).
8. Conferir artefato: se o build deveria ser nuvem, validar que **não** caiu em
   INTERNAL (login Supabase funciona).
9. Tag + release no GitHub com o APK anexado (`SKILL.md` descreve o processo).

### 9.1 APK sob demanda

O `android-build.yml` **não dispara em push para `main`**: o APK nasce apenas
quando alguém o pede. Três gestos, e só três:

| Gesto | Quando usar |
|---|---|
| Actions → **Build Android APK** → **Run workflow** | pedido avulso — testar um commit/branch, validar instalação no campo |
| push de tag `v*` (`git tag v2.7.4 && git push origin v2.7.4`) | release oficial — a tag é o pedido |
| comentar **`/apk`** num pull request | validar o commit do PR no telemóvel; o job responde no PR com o link do run |

Regras:

1. O merge em `main` continua a produzir **CI + deploy Vercel**; nada de APK
   automático (era runner gasto e artefato que ninguém usava).
2. O workflow valida o que dói no campo e **falha em vez de publicar**: URL do
   Supabase embutida no bundle (senão o APK arranca em INTERNAL) e assinatura
   com o keystore estável (senão o Android recusa a instalação por cima).
   O SHA-256 do APK e do certificado sai no resumo do job.
3. Artefato fica disponível por 7 dias (`gbr-kardek-apk`). Para release, anexe o
   APK à tag no GitHub (passo 9) — o artefato do Actions expira.
4. **A chave de assinatura é obrigatória (§ 9.2).** O build falha alto se o
   secret `ANDROID_DEBUG_KEYSTORE_BASE64` não existir: não há cache nem chave
   gerada na hora, porque chave diferente = “O app não foi instalado”.
5. **`/apk` exige escrita no repositório.** O job valida a permissão
   (`admin`/`maintain`/`write`) antes de compilar e falha fechado; PR de fork não
   gera APK (o código não é do repositório). O build sai do **HEAD do PR**, não
   de `main`, e um pedido novo no mesmo PR cancela o anterior.
6. `workflow_dispatch` só aparece na lista de Actions quando este ficheiro já
   existe em `main`: no primeiro uso, faça o merge e peça o build a seguir. O
   mesmo vale para `/apk` — o GitHub lê o workflow da branch padrão.

### 9.2 Chave de assinatura do APK (uma vez)

O APK é a identidade do app no telemóvel: **se a chave muda, a instalação por
cima falha**. Por isso a chave é uma só, guardada num secret, e o
`android-build.yml` **falha** se ela não existir (sem cache, sem geração
automática).

**Cadastrar a chave (uma vez):**

1. Actions → **Gerar keystore de assinatura (uma vez)** → **Run workflow**.
2. Baixe o artefacto `android-debug-keystore` e abra
   `ANDROID_DEBUG_KEYSTORE_BASE64.txt`.
3. Copie **tudo** (é uma linha só) e cadastre em Settings → Secrets and
   variables → Actions → **New repository secret**, com o nome exato
   `ANDROID_DEBUG_KEYSTORE_BASE64`.
4. Volte ao run e **Delete run** — a chave não deve ficar pendurada em artefactos.
5. Guarde o SHA-256 que aparece no resumo do run: é o certificado que o APK deve
   mostrar em todas as builds.

**Trocar de chave custa uma desinstalação.** A primeira versão assinada com a
chave nova **não instala por cima** da anterior (assinaturas diferentes). Antes
de a instalar: sincronize os dados de campo (desinstalar apaga o banco local) e
desinstale a versão antiga no aparelho.

O build publica o SHA-256 do APK e do certificado no resumo do run; o passo de
verificação compara-os e falha se não baterem.

---

## 10. Pendências conhecidas

| # | Pendência | Impacto | Depende de |
|---|---|---|---|
| 1 | Secrets `VITE_SUPABASE_*` não cadastrados no GitHub (Actions) e Vercel | APK e deploy Vercel nascem INTERNAL | Passo 5 do runbook (§ 7.2) — é ação no painel, em minutos |
| 2 | RLS permissiva (`p_all`) | Anon key lê além do tenant | Hardening por `tenantid` (pós-reconexão) |
| 3 | E2E Playwright fora do CI | Regressão de fluxo só manual | Decisão de custo/benefício |
| 4 | Teste de login real no Supabase | AUTH saudável e tabelas OK, mas nenhum signup/sessão de ponta a ponta validado | Conta de teste no projeto |

**Elo GitHub — estado (Fase E, 2026-11-02):** a autenticação de push está ativa
via **Git Credential Manager** (helper `manager`, conta `semorrecualg`; `ls-remote`,
`fetch` e `push` funcionam sem prompt). Um **PAT clássico sem escopos** foi avaliado
e **descartado**: autentica e lê o repositório, mas não grava secrets/variáveis de
Actions nem registra chave SSH (`X-OAuth-Scopes` vazio). Não há chave SSH registrada
na conta — se um dia o remote passar para SSH, registrar no painel e trocar a URL.
> Boa prática: qualquer token/segredo colado em conversa deve ser **revogado ou
> rotacionado** logo após o uso (GitHub → Settings → Applications).

---

## 11. Mapa de documentos

| Documento | Papel |
|---|---|
| `docs/GOVERNANCA.md` | **Este** — regras dos três elos |
| `docs/SPEC.md` | O que o produto é |
| `docs/ARCHITECTURE.md` | Como o produto é construído |
| `docs/RBAC_GOVERNANCA.md` | Papéis e permissões reais |
| `docs/SCHEMA_BASELINE.md` | Schema local congelado (v7) |
| `docs/supabase_bootstrap.sql` | DDL canônico da nuvem |
| `docs/MIGRACAO_HIBRIDA.md` | Plano de migração de dados |
| `CHANGELOG.md` | Histórico de versões |
| `SKILL.md` | Processo de release |
