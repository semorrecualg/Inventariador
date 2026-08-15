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

- **Etapa 5b:** ✅ **IMPLEMENTADA (2026-08-14)** — delta sync com checkpoint de
  `updated_at` por `[tenantid+filial]`:
  1. **`src/utils/syncCheckpoint.ts`** (novo): checkpoint persistido em
     `gbr_sync_checkpoints` por chave `[tenantid|filial]` (mesmo formato do
     dedup); `advanceSyncCheckpoint` é MONOTÔNICO (nunca retrocede);
     `computeMaxUpdatedAt`; `resolveDeltaMode(checkpoint, forceFull)` →
     `{since, incremental}`.
  2. **`fetchFullInventory`** (`supabaseService.ts`): nova opção `since` →
     adiciona `updated_at > since` na paginação (baixa SÓ o delta); nova opção
     `trackCheckpoint` → grava/avança o checkpoint ao fim do pull.
  3. **`syncFromCloud`** (`App.tsx`): quando há checkpoint E a base local tem
     dados, baixa o delta e faz **UPSERT no inventário local** (nunca substitui
     a base pelo delta — a contagem total é preservada, ex.: 12.636 após o
     merge); o `SYNC_PULL` vira `Sincronização incremental de N ativos ...
     (delta).` no audit_logs; 4º parâmetro `explicitForceFull` limpa o
     checkpoint e refaz o pull completo.
  4. **Botão "Sincronizar Tudo"** (`MainMenu.tsx`): forçar pull completo da
     Nuvem (limpa o checkpoint da chave e refaz o espelhamento de entrada).
  *Validação ao vivo no preview: com checkpoint `CICOPAL|` semeado (máx
  updated_at 08-09T21:45:53), o sync do fluxo pós-login emitiu `updated_at=gt.`
  em TODAS as chamadas e baixou 5.586 ativos (só os alterados desde o
  checkpoint) em vez de 12.636; checkpoint avançou monotonicamente para
  08-09T21:46:19; merge upsert preservou os 12.636 totais locais; SYNC_PULL
  incremental registrado. 344/344 testes (16 novos) · TSC limpo.*

- **Fix do timing do delta no boot (2026-08-14):** o auto-aplicar (Etapa 4)
  disparava o sync ANTES de o boot terminar o `loadInventory` — com
  `inventoryRef` ainda vazio, `hasLocalData=false` e o pull virava COMPLETO em
  vez de delta (regressão da 5b). Correção em 3 camadas:
  1. **`hasLocalBaseData`** (`src/utils/syncDedup.ts`): a base local tem dados
     quando há inventário em memória OU a flag persistida `isDatabaseLoaded`
     (sessão anterior; a higienização a remove);
  2. **Espera do boot** (`App.tsx` `syncFromCloud`): quando a persistência diz
     que há dados mas a base ainda carrega, aguarda um deferred resolvido no
     `finally` do init (máx 12s) — a decisão delta/full opera sobre a base REAL;
  3. **Guarda do merge incremental** (`prev.assets.length > 0`) + higienização
     limpa os checkpoints (`clearAllSyncCheckpoints` na limpeza total;
     `clearSyncCheckpoint` por unidade) para nunca rodar delta contra base vazia.
  *Validação ao vivo: reload com sessão restaurada → log `Delta ativo para
  CICOPAL| (checkpoint ...)` no auto-aplicar e **36 ativos** baixados (antes:
  pull completo da filial, 7.061); merge preservou os 12.636; checkpoint
  avançado. 348/348 testes (4 novos) · TSC limpo.*

- **Etapa 5a:** ✅ **IMPLEMENTADA (2026-08-14)** — carga inicial com a filial da
  última escolha para perfis TODAS (dono/admin). Novo helper
  `resolveBootUnitFilter(filial, lastCtx, tenantid)` (`src/utils/unitContextUtils.ts`):
  prioridade (1) filial REAL do perfil (auditor de campo, Etapa 2); (2) perfil
  TODAS/sem filial → usa a filial de `app_last_work_context` (Etapa 4) quando ela
  pertence ao MESMO contrato do usuário; (3) senão → contrato inteiro (comportamento
  atual). Aplicado nos TRÊS pontos de carga inicial (`App.tsx`): Boot Loader,
  `processSession` (auto-login) e `onLogin`; o `markPullCompleted` agora registra o
  filtro EFETIVO para o dedup casar com o que foi baixado. Muro SRE preservado:
  filial de outro contrato jamais é usada (retorna undefined → contrato inteiro).
  *Validação ao vivo no preview (dono semorr, perfil TODAS, última escolha
  CICOPAL/010101 CICOPAL GO): todos os GETs de ativos com `filial=eq.010101 CICOPAL
  GO`, paginação parando em offset=7000 (7.061 ativos = 36 páginas) — zero chamadas
  sem filtro; antes baixaria o contrato inteiro (12.636 = 64 páginas). Console:
  `Processing 7061 assets` e campanhas com `Filtro Unidade: 010101 CICOPAL GO`.
  328/328 testes (7 novos) · TSC limpo.*

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

## 5. CORREÇÃO ANTI-LOOP DE SYNC_PULL (2026-08-14)

**Sintoma (reportado):** o `Histórico de Cargas & Sincronizações` do CICOPAL registrou
**99 eventos (97 SYNC_PULL) e 713.431 ativos movimentados** numa noite de testes — para
uma base real de 12.636 ativos. O app ficou gravando SYNC_PULL no `audit_logs` da nuvem
em loop.

**Causas-raiz encontradas no código (`src/App.tsx`, `syncFromCloud`):**
1. **Dedup só no Boot Loader** — `markPullCompleted` só era chamado quando a base estava
   vazia. No login normal (base cheia), TODOS os entry points de sincronização
   (`processSession`, `onLogin`, `CloudUpdatePending`, auto-aplicar da Etapa 4) puxavam e
   gravavam um SYNC_PULL novo cada — várias entradas por sessão/login.
2. **`logAuditEvent` DENTRO do updater `setInventory(prev => …)`** — side-effect em
   updater é anti-padrão React (o updater pode ser invocado mais de uma vez): o mesmo
   SYNC_PULL podia ser gravado 2× (por isso os pares "mesma contagem, mesmo minuto" no
   histórico).
3. **Pull no-op gravava evento** — sync que retornava 0 ativos (nada mudou / falha)
   gravava "Sincronização de 0 ativos", poluindo o histórico.
4. **Lock por state, não por ref** — `if (isSyncing) return` usava estado React
   (assíncrono); chamadas do mesmo tick passavam as duas.

**Correção aplicada (todas em `src/App.tsx`):**
1. **Dedup centralizado no `syncFromCloud`** — antes do fetch, se `shouldSkipPull`
   (`wasPullCompleted([tenant|filial])` + base local com dados) e NÃO for `Sincronizar
   tudo` (`explicitForceFull`), loga "Pulando sincronização duplicada" e retorna. Agora
   cobre os 4 entry points de uma vez. `markPullCompleted` passou a ser chamado também
   ao fim do `syncFromCloud` bem-sucedido (não só no Boot Loader).
2. **Auditoria única fora do updater** — `syncAuditDetails` é capturado dentro do
   updater (para casar com o caminho incremental/full real) e o `logAuditEvent` roda UMA
   vez, logo após o `setInventory`. Fim da duplicação por invocação de updater.
3. **No-op não gera evento** — SYNC_PULL só é gravado quando o pull trouxe ativos
   (`cloudAssets.length > 0`). Delta vazio / full de 0 não poluem o histórico.
4. **Lock por ref** — `isSyncingRef` serializa chamadas concorrentes do mesmo tick
   (setado no início, liberado no `finally`).

**Validação ao vivo (preview):** reload completo com dedup recente → **ZERO `GET /assets`**
e **ZERO `POST audit_logs`** no boot (antes: múltiplos pulls + múltiplos SYNC_PULL por
boot); base local de 12.636 carregada do cache sem download. **352/352 testes ✓ · TSC
limpo.**

**Limpeza do histórico já poluído:** rodar no SQL Editor do Supabase o script de
sanitização (apagar SYNC_PULL no-op/duplicados do CICOPAL, mantendo as 2 cargas de
planilha e o pull mais recente por faixa) — ver instrução na conversa.
