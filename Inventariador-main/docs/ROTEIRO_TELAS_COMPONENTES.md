# GBR KARDEK – Inventariador · Roteiro de Telas com Componentes

> **Roteiro navegável:** sequência de telas do app, citando o **componente React** que
> renderiza cada tela (fonte: `src/App.tsx`, `src/types.ts`, `src/router/routes.tsx`).
> Atualizado em 2026-08-06 · revisado em 2026-08-12 (tool grid na Unidade Operacional,
> seletor de contrato, histórico de cargas e provisionamento de licença).

---

## 1. Roteiro em grafo (Mermaid) — `AppScreen[Componente]`

```mermaid
graph TD
    %% ===== Autenticação =====
    LOGIN[LOGIN · Login.tsx]
    REGISTER[REGISTER · Register.tsx]
    BIOMETRIC[BIOMETRIC_REGISTRATION · BiometricRegistration.tsx]
    CHANGE_PWD[CHANGE_PASSWORD · ChangePassword.tsx]
    STRESS[STRESS_TEST · StressTestManager.tsx]
    TENANT_WORK[TENANT_WORK_SELECTION · TenantWorkSelector.tsx]

    %% ===== Hub Principal / Módulos =====
    MODULE_SEL[MODULE_SELECTION · ModuleSelector.tsx]
    ASSET_CONTROL[ASSET_CONTROL_HOME · AssetControlModule.tsx]
    UNIT_SEL[UNIT_SELECTION · UnitSelector.tsx]  %% tool grid: AJUSTES · DADOS · PAINEL · AUDITORIA
    DB_MGR[DATABASE_MANAGER · DatabaseManagerScreen.tsx]
    LOAD_HISTORY[LOAD_HISTORY · LoadHistoryScreen.tsx]
    LICENSES[LICENSE_PROVISIONING · LicenseProvisioning.tsx]

    %% ===== Hub Operacional (MainMenu) / Dashboard legado =====
    DASHBOARD[DASHBOARD · Dashboard.tsx]  %% legado, fora do fluxo principal
    MAIN_MENU[MAIN_MENU · MainMenu.tsx]   %% hub operacional do auditor

    %% ===== Operações de Campo =====
    ADDR_SEL[ADDRESS_SELECTION · AddressSelector.tsx]
    INVENTORY[INVENTORY · Inventory.tsx]
    LABELING[LABELING · Labeling.tsx]
    ACTIVE_SEARCH[ACTIVE_SEARCH · ActiveSearch.tsx]
    CONSULTATION[CONSULTATION · Consultation.tsx]
    ASSET_MAP[ASSET_MAP · AssetMap.tsx]

    %% ===== Detalhes e Documentação =====
    ASSET_DETAIL[ASSET_DETAIL · AssetDetail.tsx]
    SIGNATURE[SIGNATURE · Signature.tsx]
    ASSET_PRINT[ASSET_REPORT_PRINT · AssetPrintView.tsx]

    %% ===== Gestão, Relatórios e Configurações =====
    CAMPAIGNS[CAMPAIGN_MANAGEMENT · CampaignManager.tsx]
    UNIT_CFG[UNIT_CONFIGURATOR · UnitConfigurator.tsx]
    USER_MGT[USER_MANAGEMENT · UserManagement.tsx]
    FIELD_CFG[FIELD_CONFIGURATOR · FieldConfigurator.tsx]
    QR_CFG[QR_CODE_CONFIGURATOR · QrCodeConfigurator.tsx]
    AUDIT_LOGS[AUDIT_LOGS · AuditLogs.tsx]
    GLOBAL_PERF[GLOBAL_PERFORMANCE · GlobalPerformance.tsx]
    RECONCILIATION[ACCOUNT_RECONCILIATION · AccountReconciliation.tsx]
    SOFT_DELETE[SOFT_DELETE_REPORT · SoftDeleteReport.tsx]
    IMPAIRMENT[IMPAIRMENT_REPORT · ImpairmentReport.tsx]
    SYNC_MGR[SYNC_MANAGER · SyncManager.tsx]
    ONBOARDING[ONBOARDING · OnboardingWizard.tsx]

    %% ===== Transições - Autenticação =====
    LOGIN -->|Validação de Credenciais| MODULE_SEL
    LOGIN -->|Multi-contrato (buildWorkContexts > 1)| TENANT_WORK
    LOGIN -->|Novo Usuário| REGISTER
    LOGIN -->|Biometria pós-login| BIOMETRIC
    LOGIN -->|Troca de Senha| CHANGE_PWD
    LOGIN -->|Stress Test| STRESS
    REGISTER -->|Concluído / Voltar| LOGIN
    BIOMETRIC -->|Concluir / Ignorar| MODULE_SEL
    CHANGE_PWD -->|Senha Atualizada| UNIT_SEL
    STRESS -->|Voltar| LOGIN

    %% ===== Transições - Pós-login (contrato) =====
    TENANT_WORK -->|Escolher Contrato/Filial| MODULE_SEL
    TENANT_WORK -->|Base vazia → Primeira Carga| DB_MGR
    TENANT_WORK -->|Auditor com base pronta| UNIT_SEL
    TENANT_WORK -->|Sair / Logout| LOGIN

    %% ===== Transições - Módulos e Seleção =====
    MODULE_SEL -->|Módulo Inventário| UNIT_SEL
    MODULE_SEL -->|Módulo Controle de Ativo| ASSET_CONTROL
    MODULE_SEL -->|Gerenciar Banco| DB_MGR
    MODULE_SEL -->|Logout| LOGIN
    ASSET_CONTROL -->|Voltar| MODULE_SEL
    UNIT_SEL -->|Unidade Selecionada| MAIN_MENU
    UNIT_SEL -->|AJUSTES / DADOS / PAINEL / AUDITORIA (tool grid)| MAIN_MENU
    UNIT_SEL -->|Carga / Migração| DB_MGR
    UNIT_SEL -->|Trocar Módulo| MODULE_SEL
    DB_MGR -->|Voltar| MODULE_SEL
    LOAD_HISTORY -->|Voltar| MAIN_MENU
    LICENSES -->|Voltar| MAIN_MENU

    %% ===== Hub Operacional (MAIN_MENU → funcionalidades do auditor) =====
    MAIN_MENU -->|INVENTÁRIO| ADDR_SEL
    MAIN_MENU -->|FICHA DO ATIVO| CONSULTATION
    MAIN_MENU -->|ETIQUETAR ATIVOS| LABELING
    MAIN_MENU -->|CONSULTA DE ATIVOS| CONSULTATION
    MAIN_MENU -->|CONCILIAÇÃO POR CONTAS| RECONCILIATION
    MAIN_MENU -->|ASSINATURA DIGITAL| SIGNATURE

    %% ===== Dashboard (legado — fora do fluxo principal) =====
    DASHBOARD -->|Iniciar Bipagem| ADDR_SEL
    DASHBOARD -->|Etiquetagem| LABELING
    DASHBOARD -->|Busca Ativa| ACTIVE_SEARCH
    DASHBOARD -->|Consultar Ativos| CONSULTATION
    DASHBOARD -->|Mapa Georef.| ASSET_MAP
    DASHBOARD -->|Menu Principal| MAIN_MENU
    DASHBOARD -->|Trocar Unidade| UNIT_SEL

    %% ===== Operações de Campo =====
    ADDR_SEL -->|Confirmar Local| INVENTORY
    ADDR_SEL -->|Voltar| DASHBOARD
    INVENTORY -->|Clique no Ativo| ASSET_DETAIL
    INVENTORY -->|Finalizar Lote| SIGNATURE
    INVENTORY -->|Voltar| ADDR_SEL
    SIGNATURE -->|Confirmar / Cancelar| INVENTORY
    LABELING -->|Selecionar Ativo| ASSET_DETAIL
    LABELING -->|Voltar| DASHBOARD
    ACTIVE_SEARCH -->|Selecionar Ativo| ASSET_DETAIL
    ACTIVE_SEARCH -->|Voltar| DASHBOARD
    CONSULTATION -->|Ver Ficha| ASSET_DETAIL
    CONSULTATION -->|Retornar com Tag| INVENTORY
    CONSULTATION -->|Voltar| DASHBOARD
    ASSET_MAP -->|Ponto no Mapa| INVENTORY
    ASSET_MAP -->|Voltar| DASHBOARD
    ASSET_DETAIL -->|Imprimir Ficha| ASSET_PRINT
    ASSET_DETAIL -->|Voltar| INVENTORY
    ASSET_PRINT -->|Voltar| ASSET_DETAIL

    %% ===== Menu Principal =====
    MAIN_MENU -->|Campanhas| CAMPAIGNS
    MAIN_MENU -->|Unidades e GPS| UNIT_CFG
    MAIN_MENU -->|Usuários| USER_MGT
    MAIN_MENU -->|Campos Editáveis| FIELD_CFG
    MAIN_MENU -->|QR Code| QR_CFG
    MAIN_MENU -->|Logs de Auditoria| AUDIT_LOGS
    MAIN_MENU -->|Performance Global| GLOBAL_PERF
    MAIN_MENU -->|Reconciliação| RECONCILIATION
    MAIN_MENU -->|Ativos Excluídos| SOFT_DELETE
    MAIN_MENU -->|Impairment| IMPAIRMENT
    MAIN_MENU -->|Gerenciador de Sync| SYNC_MGR
    MAIN_MENU -->|Tutorial| ONBOARDING
    MAIN_MENU -->|Trocar Unidade| UNIT_SEL
    MAIN_MENU -->|Banco de Dados| DB_MGR
    MAIN_MENU -->|Histórico de Cargas| LOAD_HISTORY
    MAIN_MENU -->|Licenças (novo cliente/MASTER)| LICENSES

    CAMPAIGNS -->|Ativar Campanha| INVENTORY
    CAMPAIGNS -->|Voltar| MAIN_MENU
    ONBOARDING -->|Concluir| MODULE_SEL
```

---

## 2. Roteiro em sequência (fluxo principal do auditor)

**Fluxo 1 — Login → Campo (caminho principal)**

```
LOGIN · Login.tsx
  → (valida credenciais)
MODULE_SELECTION · ModuleSelector.tsx
  → (selecionar módulo "Inventário")
UNIT_SELECTION · UnitSelector.tsx
  → (selecionar unidade operacional)
MAIN_MENU · MainMenu.tsx            ← Hub operacional do auditor (DASHBOARD fora do fluxo)
  ├─ INVENTÁRIO · AddressSelector.tsx → Inventory.tsx
  ├─ FICHA DO ATIVO · Consultation.tsx
  ├─ ETIQUETAR ATIVOS · Labeling.tsx
  ├─ CONSULTA DE ATIVOS · Consultation.tsx
  ├─ CONCILIAÇÃO POR CONTAS · AccountReconciliation.tsx
  └─ ASSINATURA DIGITAL · Signature.tsx
  → (escolher INVENTÁRIO)
ADDRESS_SELECTION · AddressSelector.tsx
  → (confirmar local / endereço)
INVENTORY · Inventory.tsx            ← motor canônico (Virtuoso)
  → (clicar no ativo)
ASSET_DETAIL · AssetDetail.tsx
  → (voltar / imprimir)
ASSET_REPORT_PRINT · AssetPrintView.tsx
  → (finalizar lote)
SIGNATURE · Signature.tsx
  → (confirmar assinatura → volta ao INVENTORY)
```

**Fluxo 2 — Módulo ATIVO IMOBILIZADO**

```
MODULE_SELECTION · ModuleSelector.tsx
  → (selecionar módulo "Controle de Ativo")
ASSET_CONTROL_HOME · AssetControlModule.tsx   ← Dashboard do módulo
     └─ renderiza <InventoryCard /> em "Inventário em Destaque" (tabela assets)
     └─ sub-módulos internos: ASSETS · UNITS · MOVEMENTS · DEPRECIATION · CATEGORIES · REPORTS
  → (voltar)
MODULE_SELECTION · ModuleSelector.tsx
```

**Fluxo 3 — Menu Principal (hub operacional + configurações e relatórios)**

```
MAIN_MENU · MainMenu.tsx            ← entrada após a seleção de unidade (tool grid)
  → ADDRESS_SELECTION · AddressSelector.tsx → INVENTORY · Inventory.tsx  (INVENTÁRIO)
  → CONSULTATION · Consultation.tsx                   (FICHA DO ATIVO · CONSULTA DE ATIVOS)
  → LABELING · Labeling.tsx                           (ETIQUETAR ATIVOS)
  → ACCOUNT_RECONCILIATION · AccountReconciliation.tsx (CONCILIAÇÃO POR CONTAS)
  → SIGNATURE · Signature.tsx                         (ASSINATURA DIGITAL)
  → CAMPAIGN_MANAGEMENT · CampaignManager.tsx
  → UNIT_CONFIGURATOR · UnitConfigurator.tsx
  → USER_MANAGEMENT · UserManagement.tsx
  → FIELD_CONFIGURATOR · FieldConfigurator.tsx
  → QR_CODE_CONFIGURATOR · QrCodeConfigurator.tsx
  → AUDIT_LOGS · AuditLogs.tsx
  → GLOBAL_PERFORMANCE · GlobalPerformance.tsx
  → ACCOUNT_RECONCILIATION · AccountReconciliation.tsx
  → SOFT_DELETE_REPORT · SoftDeleteReport.tsx
  → IMPAIRMENT_REPORT · ImpairmentReport.tsx
  → SYNC_MANAGER · SyncManager.tsx
  → ONBOARDING · OnboardingWizard.tsx
  → DATABASE_MANAGER · DatabaseManagerScreen.tsx      (submenu Admin: Banco de Dados)
  → LOAD_HISTORY · LoadHistoryScreen.tsx              (submenu Admin: Histórico de Cargas)
  → LICENSE_PROVISIONING · LicenseProvisioning.tsx    (submenu Admin: Licenças → tenant + MASTER)
```

**Tool grid na Unidade Operacional (2026-08-12):** o `UnitSelector.tsx` agora exibe a
fileira **AJUSTES · DADOS · PAINEL · AUDITORIA** (transferida do MainMenu) + contador
"X Ativos · Base Local". Cada botão abre o `MAIN_MENU` com o painel correspondente já
aberto via `NavigationParams.openPanel`: AJUSTES → `PREFERENCES`, DADOS → `DATA`,
PAINEL → `ADMIN`, AUDITORIA → `AUDIT`. O MainMenu **não** exibe mais a tool grid.

---

## 3. Tabela de referência — AppScreen → Componente → Rota

| AppScreen | Componente (`src/components/`) | Rota (`screenToPath`) |
|---|---|---|
| `LOGIN` | `Login.tsx` | `/login` |
| `REGISTER` | `Register.tsx` | `/register` |
| `BIOMETRIC_REGISTRATION` | `BiometricRegistration.tsx` | `/biometric` |
| `CHANGE_PASSWORD` | `ChangePassword.tsx` | `/change-password` |
| `STRESS_TEST` | `StressTestManager.tsx` | `/stress-test` |
| `MODULE_SELECTION` | `ModuleSelector.tsx` | `/modules` |
| `ASSET_CONTROL_HOME` | `AssetControlModule.tsx` (+ `InventoryCard.tsx`) | `/asset-control` |
| `UNIT_SELECTION` | `UnitSelector.tsx` | `/unit` |
| `DATABASE_MANAGER` | `DatabaseManagerScreen.tsx` (`src/screens/`) | `/db-manager` |
| `DASHBOARD` | `Dashboard.tsx` | `/dashboard` |
| `MAIN_MENU` | `MainMenu.tsx` | `/menu` |
| `ADDRESS_SELECTION` | `AddressSelector.tsx` | `/address` |
| `INVENTORY` | `Inventory.tsx` (motor canônico) | `/inventory` |
| `LABELING` | `Labeling.tsx` | `/labeling` |
| `ACTIVE_SEARCH` | `ActiveSearch.tsx` | `/search` |
| `CONSULTATION` | `Consultation.tsx` | `/consultation` |
| `ASSET_MAP` | `AssetMap.tsx` | `/map` |
| `ASSET_DETAIL` | `AssetDetail.tsx` | `/asset/` |
| `SIGNATURE` | `Signature.tsx` | `/signature` |
| `ASSET_REPORT_PRINT` | `AssetPrintView.tsx` | `/print` |
| `CAMPAIGN_MANAGEMENT` | `CampaignManager.tsx` | `/campaigns` |
| `UNIT_CONFIGURATOR` | `UnitConfigurator.tsx` | `/unit-config` |
| `USER_MANAGEMENT` | `UserManagement.tsx` | `/users` |
| `FIELD_CONFIGURATOR` | `FieldConfigurator.tsx` | `/fields` |
| `QR_CODE_CONFIGURATOR` | `QrCodeConfigurator.tsx` | `/qr-config` |
| `AUDIT_LOGS` | `AuditLogs.tsx` | `/audit-logs` |
| `GLOBAL_PERFORMANCE` | `GlobalPerformance.tsx` | `/performance` |
| `ACCOUNT_RECONCILIATION` | `AccountReconciliation.tsx` | `/reconciliation` |
| `SOFT_DELETE_REPORT` | `SoftDeleteReport.tsx` | `/soft-delete` |
| `IMPAIRMENT_REPORT` | `ImpairmentReport.tsx` | `/impairment` |
| `SYNC_MANAGER` | `SyncManager.tsx` | `/sync` |
| `ONBOARDING` | `OnboardingWizard.tsx` | `/onboarding` |
| `LICENSE_PROVISIONING` | `LicenseProvisioning.tsx` | `/licenses` |
| `TENANT_WORK_SELECTION` | `TenantWorkSelector.tsx` | `/selecionar-contrato` |
| `LOAD_HISTORY` | `LoadHistoryScreen.tsx` (`src/screens/`) | `/load-history` |

> **Nota de correção (2026-08-06):** a tela `INVENTORY` renderiza **`Inventory.tsx`**
> (motor canônico, Virtuoso, lê a tabela de trabalho `assets` via `assetRepository`).
> O card `InventoryCard.tsx` agora é exibido no Dashboard do módulo ATIVO IMOBILIZADO
> (`ASSET_CONTROL_HOME`), conforme `docs/CORRECAO_INVENTORYCARD_MODULO_ATIVO.md`.

> **Nota de fluxo (2026-08-06):** o fluxo principal do auditor passa por **`MAIN_MENU`**
> (`MainMenu.tsx`) após `UNIT_SELECTION` — o componente já ativa as 6 funcionalidades:
> **INVENTÁRIO · FICHA DO ATIVO · ETIQUETAR ATIVOS · CONSULTA DE ATIVOS ·
> CONCILIAÇÃO POR CONTAS · ASSINATURA DIGITAL**. O `DASHBOARD` (`Dashboard.tsx`) fica
> **fora do fluxo principal** (mantido como acesso legado no grafo).
>
> **Sincronização com o código (2026-08-06):** o `onSelect` do `UnitSelector` em `App.tsx`
> agora navega para `AppScreen.MAIN_MENU` (antes `DASHBOARD`) — o preview segue o fluxo do
> roteiro: `LOGIN → MODULE_SELECTION → UNIT_SELECTION → MAIN_MENU`. Os relatórios
> (`AuditLogs`, `GlobalPerformance`, `ImpairmentReport`) também voltam **apenas ao
> `MAIN_MENU`** (`setHistory([AppScreen.MAIN_MENU])`), sem passar pelo `DASHBOARD` legado.
>
> **Pós-login multi-contrato (2026-08-12):** quando `buildWorkContexts(user) > 1`, o login
> cai no **Seletor de Contrato/Filial** (`TenantWorkSelector`) antes de qualquer carga; ao
> escolher, o app persiste o contexto, sincroniza SÓ o contrato e roteia por perfil/base
> (`resolvePostSelectionScreen`). `LICENSE_PROVISIONING`, `TENANT_WORK_SELECTION` e
> `LOAD_HISTORY` são telas novas cobertas pelo enum/rotas/render e pelo contrato
> `navigationMap.test.ts` (34 nós).

---

## 4. Referências

- `src/types.ts` — enum `AppScreen` e `AppModule`
- `src/router/routes.tsx` — `screenToPath` (rota por tela)
- `src/App.tsx` — render condicional por `screen` (switch de telas)
- `docs/FLOW_GRAPH.md` — grafo canônico de navegação (transições de negócio)
- `src/__tests__/navigationMap.test.ts` — teste de contrato do mapa
