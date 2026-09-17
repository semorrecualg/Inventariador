# Fluxograma — Login na Nuvem → Download da Base do Tenant

> Fluxo de request das telas/arquivos envolvidos no **login pela nuvem e download da
> base do contrato (tenant)** no Inventariador. Segue o padrão dos docs do projeto
> (`docs/FLOW_GRAPH.md` — Mermaid `graph TD`). Os nomes entre `<b>...</b>` são os
> componentes/arquivos reais.

---

## 1. Fluxograma completo (Mermaid)

```mermaid
graph TD
    %% ═══════════════ 1 · TELA DE LOGIN ═══════════════
    subgraph SG1[1 · Tela de Login — src/components/Login.tsx]
        L1[<b>Login.tsx</b><br/>rota /login · React.lazy<br/>onSubmit → handleLogin]
        L2[Barreira Local<br/><b>useLocalAuth</b> → authenticateLocalUser<br/>utils/authUtils.ts]
        L3[Username → e-mail<br/><b>supabaseService.getEmailByUsername</b>]
        L4[Autenticação na nuvem<br/><b>supabase.auth.signInWithPassword</b>]
        L5[Perfil do contrato<br/><b>supabaseService.ensureUserProfile</b><br/>→ role / tenantid / filial / units]
    end

    %% ═══════════════ 2 · DOWNLOAD DA BASE DO TENANT ═══════════════
    subgraph SG2[2 · Download da base do tenant — pós-auth]
        D0{<b>Login.tsx</b><br/>veio da nuvem<br/>e db.local_assets.count() === 0?}
        D1[<b>supabaseService.downloadBaseToLocal</b><br/>tenantid + filiais + onProgress]
        D2[Contagem exata<br/>supabase.from 'assets' · count exact]
        D3[Paginação 1.000 / lote<br/>range start..start+999 · order id]
        D4[Grava local com markSynced<br/><b>sqliteService.bulkInsertAssetsOfflineFirst</b><br/>→ Dexie local_assets]
        D5[UI do <b>Login.tsx</b><br/>'Baixando base... X%'<br/>setDownloadingBase / setDownloadProgress]
    end

    %% ═══════════════ 3 · APP.TSX PÓS-LOGIN ═══════════════
    subgraph SG3[3 · App.tsx pós-login — overlay SINCRONIZANDO BASE]
        P1[<b>App.tsx · onLogin</b><br/>setUser · setDatabaseMode SUPABASE<br/>setSelectedUnit · sessionStorage tenantid/filial]
        P2[<b>App.tsx · syncFromCloud</b><br/>setIsSyncing true → overlay<br/>'SINCRONIZANDO BASE' / 'Aguarde,<br/>baixando dados da nuvem...']
        P3[Push de pendências<br/><b>pushLocalChanges</b> → syncAssetsToCloud<br/>+ syncConfigToCloud · processSyncQueue]
        P4[Pull da nuvem<br/><b>supabaseService.fetchFullInventory</b><br/>tenantid + unitid · paginado]
        P5[setInventory<br/>merge local sujo + nuvem<br/>isolamento por tenantid]
        P6[Persistência<br/><b>persistenceService.saveInventory</b><br/>→ Dexie / SQLite local]
        P7[setIsSyncing false → overlay some]
    end

    %% ═══════════════ 4 · ROTEAMENTO PÓS-LOGIN ═══════════════
    subgraph SG4[4 · Roteamento pós-login — roda em paralelo ao sync]
        R1[Efeito SRE_NAV<br/><b>App.tsx</b> · user setado + tela LOGIN]
        R2{Multi-contrato?<br/><b>buildWorkContexts</b> > 1}
        R3[<b>TenantWorkSelector.tsx</b><br/>TENANT_WORK_SELECTION<br/>escolha de contrato/filial]
        R4[<b>routingUtils.processarRoteamentoPosLoginSaas</b><br/>profile + customNavigate]
        R5[Decisão pela base local<br/><b>sqliteService.countAtivosByTenant</b>]
        R6{totalAtivosLocal === 0?}
        R7[Admin/Master · base vazia<br/>/load-database<br/><b>DatabaseManagerScreen.tsx</b>]
        R8[Auditor · base vazia<br/>/auditor/aguardando-carga<br/><b>ModuleSelector.tsx</b>]
        R9[Admin global<br/>/saas/painel-global<br/><b>ModuleSelector.tsx</b>]
        R10[Master<br/>/admin/painel-controle<br/><b>ModuleSelector.tsx</b>]
        R11[Auditor · base pronta<br/>/auditor/selecionar-filial<br/><b>UnitSelector.tsx</b>]
        R12[Selecionar unidade → MAIN_MENU<br/><b>MainMenu.tsx</b>]
    end

    %% ═══════════════ 5 · AUTO-LOGIN / SESSÃO (F5) ═══════════════
    subgraph SG5[5 · Auto-login / sessão — App.tsx processSession]
        S1[Boot initApp<br/><b>supabase.auth.getSession</b> · JWT check]
        S2[<b>processSession</b><br/>ensureUserProfile → loggedUser<br/>setUser + setDatabaseMode SUPABASE]
        S3[Efeito de carga do inventário<br/>base local vazia + nuvem → fetchFullInventory<br/>síncrono antes de dispensar o splash]
    end

    %% ── Transições ──
    L1 -->|credenciais locais não bastam| L2
    L2 -->|SOLO / Barreira Local OK| P1
    L2 -->|SUPABASE_PLUS| L3 --> L4 --> L5
    L5 --> D0
    D0 -->|sim| D1 --> D2 --> D3 --> D4
    D4 -. onProgress .-> D5
    D5 --> P1
    D0 -->|não| P1
    P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7
    P1 -.multi-contrato: sync adiado.-> R3
    P2 -.paralelo.-> R1
    R1 --> R2
    R2 -->|sim| R3
    R2 -->|não| R4 --> R5 --> R6
    R6 -->|0 · admin/master| R7
    R6 -->|0 · auditor| R8
    R6 -->|>0 · admin global| R9
    R6 -->|>0 · master| R10
    R6 -->|>0 · auditor| R11
    R11 -->|onSelect unidade| R12
    S1 --> S2 --> P2
    S2 --> S3
```

---

## 2. Arquivos e componentes por etapa

| # | Etapa | Componente / função | Arquivo |
|---|---|---|---|
| 1 | Formulário de login + submit | `Login.tsx` (`handleLogin`) | `src/components/Login.tsx` |
| 2 | Validação local (barreira) | `useLocalAuth` → `authenticateLocalUser` | `src/hooks/useLocalAuth.ts` · `src/utils/authUtils.ts` |
| 3 | Resolução de e-mail por username | `getEmailByUsername` | `src/services/supabaseService.ts` |
| 4 | Autenticação na nuvem | `supabase.auth.signInWithPassword` | Supabase JS · `src/services/supabaseService.ts` |
| 5 | Perfil / RBAC do contrato | `ensureUserProfile` (user_permissions) | `src/services/supabaseService.ts` |
| 6 | Gate "base local vazia?" | `db.local_assets.count()` | `src/services/sqliteService.ts` (Dexie) |
| 7 | **Download da base do tenant** | `downloadBaseToLocal(tenantid, filiais, onProgress)` | `src/services/supabaseService.ts` |
| 8 | Gravação local (markSynced) | `bulkInsertAssetsOfflineFirst(..., { markSynced: true })` | `src/services/sqliteService.ts` |
| 9 | Progresso na tela | `downloadingBase` / `downloadProgress` → "Baixando base... X%" | `src/components/Login.tsx` |
| 10 | Hook pós-login do App | `onLogin(u)` → `setUser` + `syncFromCloud` | `src/App.tsx` |
| 11 | **Overlay SINCRONIZANDO BASE** | `isSyncing` (nuvem: "Aguarde, baixando dados da nuvem...") | `src/App.tsx` |
| 12 | Push de pendências locais | `pushLocalChanges` → `syncAssetsToCloud` + `syncConfigToCloud` | `src/App.tsx` · `src/services/supabaseService.ts` |
| 13 | Pull da nuvem | `fetchFullInventory(tenantid, unitid)` | `src/services/supabaseService.ts` |
| 14 | Merge + isolamento de tenant | `setInventory` (dentro de `syncFromCloud`) | `src/App.tsx` |
| 15 | Persistência local | `saveInventory` | `src/services/persistenceService.ts` |
| 16 | Roteamento pós-login | Efeito SRE_NAV → `processarRoteamentoPosLoginSaas` | `src/App.tsx` · `src/utils/routingUtils.ts` |
| 17 | Decisão por base local | `countAtivosByTenant(tenantid)` | `src/services/sqliteService.ts` |
| 18 | Destino — base vazia (admin/master) | `/load-database` → `DatabaseManagerScreen` | `src/screens/DatabaseManagerScreen.tsx` |
| 19 | Destino — base vazia (auditor) | `/auditor/aguardando-carga` → `ModuleSelector` | `src/components/ModuleSelector.tsx` |
| 20 | Destino — base pronta (auditor) | `/auditor/selecionar-filial` → `UnitSelector` | `src/components/UnitSelector.tsx` |
| 21 | Multi-contrato | `TenantWorkSelector` → `resolvePostSelectionScreen` | `src/components/TenantWorkSelector.tsx` · `src/utils/routingUtils.ts` |
| 22 | Auto-login / F5 | Boot `initApp` → `processSession` | `src/App.tsx` |

---

## 3. Observações do diagnóstico (feedback)

Pontos verificados no código — base para investigar a tela em branco após o
"SINCRONIZANDO BASE":

1. **Existem DOIS downloads em sequência no login pela nuvem**:
   - `Login.tsx` baixa a base com `downloadBaseToLocal` (overlay "Baixando base... X%")
     **antes** de chamar `onLogin`.
   - `App.tsx` (`onLogin`) dispara `syncFromCloud`, que baixa **de novo** com
     `fetchFullInventory` (overlay "SINCRONIZANDO BASE / Aguarde, baixando dados da
     nuvem..."). Os dois escrevem na mesma base local (Dexie `local_assets` via
     `bulkInsertAssetsOfflineFirst` / `saveInventory`).
   - Efeito prático: com base vazia, o login puxa a base duas vezes — o
     "SINCRONIZANDO BASE" pode demorar mais do que antes desse fluxo existir.

2. **O roteamento pós-login roda em paralelo com o sync** (não espera o overlay
   terminar): o destino é decidido por `countAtivosByTenant` **no instante** em que o
   efeito SRE_NAV roda. Como o download ainda pode estar gravando, o count pode ler
   `0` e o usuário cair em `/auditor/aguardando-carga` (auditor) ou `/load-database`
   (admin) — mesmo com dados chegando em seguida. Quando o sync termina
   (`setIsSyncing(false)`), o overlay some e a tela roteada aparece.

3. **Tela em branco — hipóteses a validar no console**:
   - Se `fetchFullInventory` falhar (rede/RLS), o `catch` do `syncFromCloud` ativa o
     modo INTERNAL/offline e mostra o modal "Conexão Suspensa"; se uma exceção escapar
     do `catch`, o app pode quebrar e o `ErrorBoundary` (que renderiza cartão visível)
     ou a página fica branca.
   - Se o destino roteado for uma tela que depende de dados/estado que ainda não
     chegaram (ex.: `ModuleSelector` sem `currentModule`), ela pode renderizar vazio.
   - Vale checar também o `isDataLoaded`/splash: se o loader estático foi removido
     mas a renderização principal não liberou, a página fica em branco.

> Próximo passo sugerido: reproduzir o login na preview e capturar o console
> (erros do `fetchFullInventory`/`downloadBaseToLocal` + log do SRE_NAV) para
> confirmar qual das hipóteses acima explica o branco.

---

## 4. Referências

- `src/components/Login.tsx` — formulário, barreira local e gatilho do download
- `src/services/supabaseService.ts` — `downloadBaseToLocal` · `fetchFullInventory` · `ensureUserProfile`
- `src/services/sqliteService.ts` — `local_assets` · `bulkInsertAssetsOfflineFirst` · `countAtivosByTenant`
- `src/App.tsx` — `onLogin` · `syncFromCloud` · overlay `isSyncing` · efeito SRE_NAV
- `src/utils/routingUtils.ts` — `processarRoteamentoPosLoginSaas` · `resolvePostSelectionScreen`
- `src/services/persistenceService.ts` — `saveInventory`
- `docs/FLOW_GRAPH.md` — mapa de navegação canônico das telas
