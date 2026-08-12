# RBAC — Matriz Real de Governança (GBR KARDEK)

> Documento canônico da implementação **real** de controle de acesso por função do
> módulo INVENTARIADOR. Substitui/atualiza o "Relatório Canônico de Governança e
> Mapeamento de Rotinas RBAC": este documento reflete o código que existe hoje.

---

## 1. Arquitetura real (o que o relatório anterior descrevia ≠ o que existe)

O relatório canônico citava `permissionsService.ts` e `PermissionGate.tsx` como a
camada RBAC. **Isso não corresponde ao código** — a auditoria encontrou:

| Item citado no relatório | Realidade no código |
|---|---|
| `permissionsService.ts` com `hasPermission(role, perm)` | ❌ É permissão de **HARDWARE** (câmera/GPS) — `checkPastPermissions`/`requestAllPermissions`. Não tem RBAC. |
| `PermissionGate.tsx` como gate de rotas | ❌ É a tela de permissões do **Android no boot** ("ACESSO OBRIGATÓRIO"). Não é gate de tela. |
| `UserRole.USER / OPERADOR` | ✅ **Adicionado** em `src/types.ts` (Etapa 1 da implantação). |
| Matriz dispersa em checagens inline | ✅ Centralizada em **`src/services/rbacService.ts`** (criado na Etapa 1). |

**Camada canônica de decisão: `src/services/rbacService.ts`** — matriz declarativa
por papel, com as Trilhas A/B/C do módulo INVENTARIADOR.

---

## 2. Papéis (enum `UserRole` em `src/types.ts`)

```
ADMIN · MASTER · AUDITOR · AUXILIARY_AUDITOR · USER (novo) · DEMO · MOBILE_SINGLE
```

- **ADMIN / MASTER** — governança total (Trilhas A + B + C).
- **AUDITOR / AUXILIARY_AUDITOR** — auditoria e concordância + operação de campo (B + C).
- **USER** — operador de campo (Trilha C): inventário, etiquetagem, consulta, busca ativa.
- **DEMO / MOBILE_SINGLE / GESTOR** — mantêm **paridade com o comportamento legado**
  (acesso amplo), para não regredir os fluxos existentes.
- **Flags legados** `is_admin` / `isAdmin` e o **email do proprietário**
  (`VITE_ADMIN_EMAIL`) concedem acesso total em qualquer papel.

---

## 3. Permissões e matriz (Trilhas A/B/C)

```ts
type UserPermission =
  // TRILHA A — Administrativo (ADMIN / MASTER)
  | 'manage_campaigns'        // Gestão de Campanhas de Inventário
  | 'configure_fields'        // Parametrização de Campos Editáveis
  | 'configure_qr_code'       // Mapeamento de Estrutura de QR Code
  | 'manage_users'            // Gerenciamento de Acessos e Usuários
  | 'configure_units'         // Configurador e Sincronizador de Filiais
  | 'manage_database'         // Gerenciamento e Limpeza do Banco de Dados
  // TRILHA B — Auditoria e Concordância (AUDITOR / AUXILIARY_AUDITOR / ADMIN)
  | 'view_reconciliation'     // Conciliação e Reconciliação Contábil
  | 'view_impairment'         // Relatório de Recuperabilidade / Impairment
  | 'view_audit_logs'         // Trilha de Auditoria e Logs de Alteração
  | 'view_soft_delete'        // Relatório de Desmobilização e Deletados
  | 'view_global_performance' // Painel de Performance Global
  | 'sign_documents'          // Coleta de Assinatura Digital de Encerramento
  // TRILHA C — Operação de Campo (USER / OPERADOR e demais)
  | 'field_inventory'         // Coleta Física / Inventário
  | 'field_labeling'          // Identificação e Etiquetagem
  | 'field_consultation'      // Consulta Rápida / Ficha do Ativo
  | 'field_active_search';    // Busca Ativa por Proximidade/RST
```

### Matriz papel × permissão

| Papel | Trilha A | Trilha B | Trilha C |
|---|---|---|---|
| `ADMIN` / `MASTER` | ✅ todas | ✅ todas | ✅ todas |
| `DEMO` / `MOBILE_SINGLE` / `GESTOR` | ✅ (paridade legada) | ✅ | ✅ |
| `AUDITOR` / `AUXILIARY_AUDITOR` | ❌ | ✅ todas | ✅ todas |
| `USER` (Operador) | ❌ | ❌ | ✅ todas |
| Papel desconhecido | ❌ | ❌ | ✅ (fallback operacional — nunca fica sem acesso) |

**Soberania do proprietário:** o email `VITE_ADMIN_EMAIL` (hoje `semorr@gmail.com`)
passa por **todas** as verificações, mesmo que o perfil tenha role `USER` — garantia
de acesso total do dono do sistema (offline-first).

---

## 4. API do `rbacService.ts`

```ts
hasPermission(role, permission)            // papel → permissão (matriz pura)
getRolePermissions(role)                   // conjunto de permissões do papel
userHasPermission(user, permission)        // objeto User → permissão (honra flags legados + email dono)
isAdminRole(role) / isAuditorRole(role) / isOperatorRole(role)
isAdminUser(user) / isAuditorUser(user)    // equivalentes modernos das checagens inline antigas
isOwnerEmail(email)                        // email == VITE_ADMIN_EMAIL (case-insensitive)
```

---

## 5. Onde os gates são aplicados

### `src/components/MainMenu.tsx`
- Toolbar **DADOS** e **PAINEL** — `isAdminUser(user)`.
- Toolbar **AUDITORIA** (novo, Trilha B) — `isAuditorUser(user)` → abre o submenu
  com as 6 rotinas: Conciliação Contábil, Recuperabilidade (Impairment),
  Trilha de Auditoria, Desmobilizados (SoftDelete), Performance Global,
  Assinatura Digital.
- Painel Administrativo (Trilha A): Configurar Campos, Configurar QR Code,
  Acessos, Auditoria, Integridade, Eventos, **Filiais** (UNIT_CONFIGURATOR),
  **Banco de Dados** (DATABASE_MANAGER — gate adicional `canAccessDatabaseManager`).
- Grid de módulos: **CONCILIAÇÃO POR CONTAS** e **ASSINATURA DIGITAL** gated por
  `isAuditor` (Trilha B); INVENTÁRIO / FICHA / ETIQUETAR / CONSULTA livres (Trilha C).

### `src/App.tsx` — guardas de tela (defesa em profundidade, padrão "Acesso Restrito")
| Tela | Permissão |
|---|---|
| `USER_MANAGEMENT` | `manage_users` |
| `FIELD_CONFIGURATOR` | `configure_fields` |
| `QR_CODE_CONFIGURATOR` | `configure_qr_code` |
| `CAMPAIGN_MANAGEMENT` | `manage_campaigns` |
| `UNIT_CONFIGURATOR` | `configure_units` |
| `DATABASE_MANAGER` | `manage_database` (via `canAccessDatabaseManager` + guarda de navegação) |
| `AUDIT_LOGS` | `view_audit_logs` |
| `ACCOUNT_RECONCILIATION` | `view_reconciliation` |
| `IMPAIRMENT_REPORT` | `view_impairment` |
| `SOFT_DELETE_REPORT` | `view_soft_delete` |
| `GLOBAL_PERFORMANCE` | `view_global_performance` |
| `SIGNATURE` | `sign_documents` |

> A tela de login, seleção de unidade e as telas de campo (Inventário, Etiquetar,
> Consulta, Busca Ativa) permanecem acessíveis a todos os papéis operacionais.

---

## 6. Testes

`src/__tests__/rbacService.test.ts` — 12 testes travando a matriz:
- Trilha A (ADMIN/MASTER) total; Trilha B (auditores) com acesso de auditoria mas
  **sem** gestão; Trilha C (USER) só campo.
- Soberania: email do proprietário com role USER continua com acesso total;
  flags `is_admin`/`isAdmin` garantem acesso.
- Paridade legada: DEMO / MOBILE_SINGLE / GESTOR com acesso amplo.
- Fallback: papel desconhecido → operação de campo; `null`/`undefined` → negado
  para governança.

**Status:** `tsc -b --noEmit` limpo · 227/227 testes verdes (215 legados + 12 RBAC).

---

## 7. Pendência de backend (signUp Supabase 500)

O cadastro de usuários no Supabase retorna `500 "Database error saving new user"`
(erro dentro do `auth.users`, provavelmente trigger de provisionamento apontando
para tabela/coluna inexistente). Ver `docs/supabase_signup_500_diagnostico.sql`.
