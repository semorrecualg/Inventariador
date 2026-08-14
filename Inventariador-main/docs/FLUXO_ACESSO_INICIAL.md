# FLUXO DE ACESSO INICIAL — Script Atual, Diagnóstico e Proposta de Melhoria

> **Data:** 2026-08-13 · **Escopo:** telas iniciais (Login → seletor → módulos → Unidade Operacional)
> **Fonte:** código real (`src/App.tsx`, `src/components/Login.tsx`, `TenantWorkSelector.tsx`, `ModuleSelector.tsx`, `UnitSelector.tsx`, `src/services/supabaseService.ts`)

---

## 1. SCRIPT DAS AÇÕES ATUAIS (passo a passo até a Unidade Operacional)

### Etapa 0 — Boot do app (`App.tsx` ~linha 3000)
1. Splash "CARREGANDO INVENTARIADOR GBR..." + loader estático (`index.html`).
2. `loadInventory()` lê o inventário persistido (localforage/IndexedDB).
3. **Boot Loader (carga nº 1):** se a base local está vazia, modo ≠ INTERNAL e há rede →
   `fetchFullInventory(user.tenantid)` baixa **TODOS os ativos do contrato** em lotes de 200
   (12.636 no CICOPAL) **antes** de dispensar o splash. Grava `SYNC_PULL` no audit_logs.
4. Tela de **Login** (`#/login`): badge de ambiente (`SUPABASE (WEB)`), campos usuário/senha,
   botões "ACESSAR SISTEMA" e "EXPERIMENTAR GRÁTIS (MODO DEMO)".

### Etapa 1 — Autenticação (`Login.tsx` `handleSubmit`, linha 219)
Camadas de validação em ordem:
1. **Dexie** (`localDb.users`) — usuário local com senha.
2. **Barreira Local** (SQLite/localforage) — usuário físico ou padrão admin.
3. **Supabase** (se licença `SUPABASE_PLUS` e credenciais presentes) —
   `signInWithPassword` + `ensureUserProfile` → perfil com `tenantid`, `role`, `units`/`filiais`.

Regra de bloqueio SRE: admin/master **sem tenantid** é impedido de logar (não vira "GLOBAL").

### Etapa 2 — Auto-login / roteamento pós-login (`App.tsx` `processSession`, ~linha 3940)
1. Loga `LOGIN` no audit_logs.
2. Verifica se o usuário é **multi-contrato** (`buildWorkContexts(user).length > 1`):
   - **Multi-contrato:** vai para o **Seletor de Contrato/Filial** (`#/selecionar-contrato`,
     `TenantWorkSelector.tsx`) — **o sync é adiado** até a escolha.
   - **Contrato único (ex.: semorr/CICOPAL):** chama `syncFromCloud(tenantid)` →
     **carga nº 2** (baixa o contrato inteiro de novo via `fetchFullInventory`).
3. Roteia por perfil/base (`resolvePostSelectionScreen`):
   - base vazia + admin/master → `DATABASE_MANAGER` (Primeira Carga);
   - auditor com base → `UNIT_SELECTION`; demais → `MODULE_SELECTION`.

### Etapa 3 — Seleção de módulo (`ModuleSelector.tsx`, `#/modules`)
1. Gate de "Primeira Carga" (se o tenant não tem dados, não-admin é bloqueado).
2. Dois cards grandes: **INVENTARIADOR** e **CONTROLE DE ATIVO** (oculto p/ auditor).
3. `onSelect(module)` → persiste `app_current_module` → `UNIT_SELECTION`.

### Etapa 4 — Unidade Operacional (`UnitSelector.tsx`, `#/unit`)
1. Lista as **filiais** do contrato com contagens (`getOperationalUnitsWithStats`,
   agrupado por `[tenantid+filial]` — muro multi-tenant, homônimos distinguidos com badge).
2. Header mostra **total geral de ativos da base local** + tool grid
   (AJUSTES · DADOS · PAINEL · AUDITORIA).
3. `onSelect(filial)` → grava `selectedUnit`/`filial`/`tenantid` (sessão+local) →
   **`MAIN_MENU`** (hub operacional da filial). **Não há nova carga aqui** — os dados
   já estão em memória (baixados nas etapas 0/2).

---

## 2. DIAGNÓSTICO — O PROBLEMA DAS "DUAS CARGAS COMPLETAS"

O usuário percebeu corretamente: **para perfil de contrato único, o tenant é baixado
2× por sessão**:

| # | Ponto de carga | Local | Gatilho | O que baixa |
|---|---|---|---|---|
| 1 | **Boot Loader** (`App.tsx` ~3079) | antes do login | base local vazia + rede | `fetchFullInventory(tenantid)` — **contrato inteiro** |
| 2 | **Auto-login sync** (`App.tsx` ~3961) | após login | `!multiContextProfile` | `syncFromCloud(tenantid)` → `fetchFullInventory` — **contrato inteiro de novo** |

**Por que acontece:** o Boot Loader foi criado para o splash não dispensar antes da
primeira busca; o auto-login dispara `syncFromCloud` para garantir atualização. Os dois
fazem o MESMO trabalho (pull completo paginado de 200 em 200) sem sincronização entre si.

**Custo:** 12.636 ativos × 2 = ~25 mil registros trafegados + persistidos a cada login
(só o espelhamento 12.636 leva ~1 min nos logs). Em mobile/Android com rede móvel, isso é
tráfego e bateria desnecessários.

**Ponto de apoio já existente (chave da proposta):** `fetchFullInventory(tenantid, unitid)`
já aceita **filtro por filial** (`q.eq('filial', cleanUnitId)`), e o `handleSelectWorkContext`
já sincroniza por filial quando o usuário passa pelo seletor. O que falta é **usar o filtro
de filial também no fluxo de contrato único** e **eliminar a duplicação Boot × Sync**.

---

## 3. PROPOSTA DE MELHORIA — "Login com Seleção de Contrato + Filial + Módulo"

Fluxo-alvo (unifica o que o usuário pediu, sem backdoor, preservando o muro SRE):

```
[LOGIN]  usuário + senha
   │  valida (Dexie → Local → Supabase)
   ▼
[RESOLUÇÃO DE CONTEXTO — tela única pós-login]
   • Mostra o(s) tenantid(s) autorizados (badge/avatar do contrato)
   • Listbox de FILIAIS do tenant escolhido (ou cards de toque rápido)
   • 2 botões grandes: [INVENTARIADOR] [CONTROLE DE ATIVO]
   • Checkbox "Usar estas informações em todas as sessões" (como a referência TOTVS)
   │
   ▼
[CARGA SOB DEMANDA — UMA única carga]
   fetchFullInventory(tenantid, filialSelecionada)   ← filtrada por filial!
   (base vazia + admin → cai no GESTOR de Primeira Carga)
   │
   ▼
[ROTEAMENTO DIRETO]
   INVENTARIADOR → hub da filial (MAIN_MENU)  [auditor]
                 → Unidade Operacional       [admin que quiser trocar de filial]
   CONTROLE DE ATIVO → AssetControlHome
```

### 3.1 Benefícios
- **Uma carga só** — o Boot Loader e o auto-login deixam de puxar o contrato inteiro duas
  vezes; a carga é **filtrada pela filial escolhida** (ex.: 010201 SNACKS PA = 2.066 ativos
  em vez de 12.636).
- **Menos tráfego no Android** — download sob demanda do que o operador vai usar de fato.
- **Fluxo enxuto** — login → escolha → dentro do trabalho, sem passar por
  Módulos → Unidade → Menu (3 saltos viram 1).
- **Base para a seleção multi-filial/multi-contrato** — o mesmo componente resolve os dois
  casos (o `TenantWorkSelector` atual vira o caso "2+ contratos" da mesma tela).
- **Sem regressão do muro** — `[tenantid+filial]` continua sendo a chave de isolamento;
  nenhum dado de outro contrato é carregado ou exibido.

### 3.2 Pontos de atenção / decisões
1. **Controle de Ativo usa a mesma base de assets** — a escolha do módulo NÃO reduz a carga
   (ambos leem os mesmos ativos). Ela simplifica a navegação, não o volume. A redução real
   de volume vem do **filtro por filial**.
2. **Unidade Operacional continua útil** — para o admin trocar de filial sem relogar;
   o fluxo novo é o atalho para o caso mais comum (uma filial por sessão).
3. **Cache por filial** — opcional de fase 2: manter em IndexedDB a base já baixada por
   `[tenantid+filial]` para que a reentrada offline não exija rede.
4. **"Usar em todas as sessões"** — persistir a última escolha (`app_last_work_context`)
   e, na próxima sessão, pular a tela de contexto direto para a carga daquela filial
   (com botão "Trocar filial/contrato" disponível).

### 3.3 Plano de implantação por etapas (sem perda de código)
- **Etapa 1 (mínima, alto ganho):** ✅ **IMPLEMENTADA (2026-08-13)** — três camadas:
  1. **Muro SRE no `fetchFullInventory`** (`supabaseService.ts`): nunca baixa sem
     tenantid resolvido (aborta com log); o backup manual explícito do dono usa
     `{ allowUnscoped: true }`. *Elimina o vazamento de contrato (14.702 = 2 contratos
     numa única carga → 12.636 só do CICOPAL).*
  2. **Dedup de request** (`pendingPulls` por `[tenantid|unidade]`): chamadas
     concorrentes (Boot Loader + sync do auto-login) compartilham UMA paginação.
  3. **Anti-loop do Boot Loader** (`bootLoaderStartedRef` no App): o effect que baixa
     a base vazia não re-executa o download quando o `user` muda durante o
     processSession. + guarda do auto-login via `shouldSkipPull` (flag de pull
     concluído por sessão em `src/utils/syncDedup.ts`).
  *Validação ao vivo: rede 100% filtrada `eq.CICOPAL` (12.636, config_CICOPAL),
  zero chamadas sem filtro; logs "Pull em andamento... Deduplicando" e "Pulando
  re-execução do efeito". 9 testes novos (syncDedup) · 309/309 ✓.*
- **Etapa 2:** ✅ **IMPLEMENTADA (2026-08-13)** — filtro de filial no fluxo de
  contrato único. Novo helper `resolveUnitFilter(filial)` (`src/utils/unitContextUtils.ts`):
  perfil com filial real (auditor de campo) → o Boot Loader, o `processSession` e o
  `onLogin` passam `fetchFullInventory(tenantid, filial)` e baixam SÓ os ativos da
  filial (ex.: 010201 SNACKS PA = 2.066 em ~11 chamadas, em vez de 12.636 em ~64);
  perfil sem filial ou com sentinela `TODAS` (dono/admin) → contrato inteiro preservado.
  A flag de dedup (Etapa 1) também passou a respeitar `[tenantid+filial]`.
  *Validação: 312/312 testes (3 novos) · TSC limpo · runtime confirmado no preview.*
- **Etapa 3 (UX pedida):** ✅ **IMPLEMENTADA (2026-08-13)** — tela única de Resolução de
  Contexto pós-login (`WorkContextSelector.tsx`, `#/contexto`): contrato (tenantid) →
  listbox de filiais → módulo (INVENTARIADOR / CONTROLE DE ATIVO) → `ACESSAR O MÓDULO`
  persiste o contexto (`persistWorkContext`) e roteia por perfil/base. Reutiliza o
  `TenantWorkSelector` (agrupamento) e o `ModuleSelector` (cards de módulo) como blocos.
  **Sanitização da listbox:** `buildWorkContexts` (passo 2) agora descarta filiais
  obsoletas de registros locais (ex.: `MATRIZ` de sessão antiga/demo) quando o contrato
  tem filiais REAIS na base local — a autorização explícita (filial na base) é mantida.
  *Validação: 314/314 testes (2 novos) · TSC limpo · runtime no preview: listbox com as
  5 filiais reais do CICOPAL (010101 CICOPAL GO, 010201 SNACKS PA, 010401 CARPER BA,
  010105 CICOPAL PA, 010301 FEIRA BOA BA) e contexto persistido `CICOPAL/010201 SNACKS
  PA` → módulo INVENTARIADOR. Bônus: fix do gate de login `SUPABASE vs SUPABASE_PLUS`
  (Login.tsx) que impedia o login manual na 2ª sessão (falso "Supabase desligado").*
- **Etapa 4:** ✅ **IMPLEMENTADA (2026-08-13)** — cache por `[tenantid+filial]` +
  "lembrar escolha" para reentrada offline instantânea:
  1. **`persistLastWorkContext`/`readLastWorkContext`/`isValidLastContext`**
     (`src/utils/workContextUtils.ts`): a escolha contrato+filial+módulo é persistida
     em `app_last_work_context`; a validação cobre autorização por contexto E a regra
     do dono/admin sem units (autorizado para qualquer filial do próprio contrato,
     sem depender da base carregar) + bloqueio de CONTROLE DE ATIVO para auditor.
  2. **Auto-aplicar pós-login** (`App.tsx` `executePostLoginRouting`): com última
     escolha válida, o seletor é pulado e o usuário vai direto ao módulo da filial;
     troca disponível pelo botão **"Trocar filial/contrato"** no header do hub.
  3. **Dedup estendido** (`src/utils/syncDedup.ts`): pull do contrato inteiro
     (`tenantid|`) agora cobre qualquer filial dele — reentrada não re-baixa a filial
     escolhida; o `handleWorkContextModuleSelect` pula o sync quando o pull já foi
     feito e a base local tem dados.
  *Validação: 321/321 testes (6 novos) · TSC limpo · runtime no preview: seleção
  010201 SNACKS PA/INVENTORY → reload → cai direto no hub (`#/menu`), sem seletor,
  sem nova carga; botão Trocar → seletor com as 5 filiais.*

- **Fix do roteamento do boot (2026-08-14):** o `checkDatabaseEmptiness` rodava
  NO MEIO do sync do boot (base vazia momentânea, `isDataLoaded=false`) e, com o
  e-mail do usuário ainda não resolvido na janela do auto-aplicar (`isBypass` falso),
  empurrava `UNIT_SELECTION` por cima do hub da filial/do seletor. Correção: o check
  só roda depois do load (`!isDataLoaded → return`), e `MAIN_MENU`/
  `WORK_CONTEXT_SELECTION` entraram na lista de isenção da BLINDAGEM. Reproduzido
  com histórico poluído + sessão do dono: antes `#/unit` (hijack), depois `#/menu`
  estável em reloads consecutivos.

---

## 4. VALIDAÇÃO E TESTES
- `npx tsc -b --noEmit` e `npm test` (baseline atual: 300/300) antes e depois de cada etapa.
- Teste unitário: garantir que `syncFromCloud` NÃO dispara pull duplicado quando o Boot
  Loader já populou a base (mock de `fetchFullInventory`).
- Teste de roteamento: escolher filial + módulo → tela final correta por perfil
  (auditor → hub; admin → Unidade/Controle; base vazia → Gestor).
- Validação ao vivo no preview: contagem de chamadas de rede
  (`preview_logs` → contagem de `GET assets?offset=` deve cair de 64 para ~11 por sessão
  no caso de filial única).
