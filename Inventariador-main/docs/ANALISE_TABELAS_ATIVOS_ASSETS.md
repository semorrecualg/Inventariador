# GBR KARDEK – Inventariador · Análise DBA — Redundância `ativos` / `assets` / `local_assets`

> **Status:** APROVADO (decisão de arquitetura) ✅ · **Data:** 2026-08-06
> **Fase:** 0 (pós **export de segurança ✅**) → decisões a aplicar na Fase 1 (repositórios)
> **Escopo:** Consolidação + comparação · **Papéis (confirmado):** `assets` canônica ·
> `local_assets` baseline · `ativos` sai
> **Fontes:** `docs/SCHEMA_BASELINE.md` (congelado v4) · `docs/ARCHITECTURE.md` · `docs/MIGRACAO_HIBRIDA.md` · `docs/SPEC.md`

---

## 1. Pergunta (recorte)

O snapshot do schema (`SCHEMA_BASELINE.md` §2) lista **três tabelas com o mesmo tipo-fonte
`DexieAsset`, a mesma PK `primarykey` e os mesmos índices** (`filial`, `_is_synced`,
`[tenantid+filial]`): `local_assets`, `ativos` e `assets`.

1. `ativos` e `assets` são idênticas? **Sim.**
2. Qual deve ser a tabela **canônica** (a que o app usa e que sincroniza com o Supabase)?
3. Como eliminar a redundância **sem perda de dados** e mantendo a ideia original —
   **duas tabelas**: os **dados carregados/armazenados** × as **alterações criadas na
   auditoria**, para **comparar as duas**?

---

## 2. Diagnóstico — são idênticas… e são TRÊS, não duas

### 2.1 Estrutura (baseline congelado v4)

| Tabela | Tipo | PK | Índices | Identidade estrutural |
|---|---|---|---|---|
| `local_assets` | `DexieAsset` | `primarykey` | `filial`, `_is_synced`, `[tenantid+filial]` | 100% idêntica |
| `ativos` | `DexieAsset` | `primarykey` | `filial`, `_is_synced`, `[tenantid+filial]` | 100% idêntica |
| `assets` | `DexieAsset` | `primarykey` | `filial`, `_is_synced`, `[tenantid+filial]` | 100% idêntica |

`SCHEMA_BASELINE.md` §3.1 já confirma textualmente: *“Três tabelas espelho (mesmo
tipo/shape)”* — e o fingerprint congelado (§5.2) é idêntico para as três.

### 2.2 Comportamento de dados (documentado)

| Observação | Fonte |
|---|---|
| `DatabaseLoaderService` grava a carga em **`[ativos, assets, local_assets, …]` na mesma transação** → **triple-write** (3× o mesmo dado, 3× custo de escrita, 3× superfície de divergência) | `ARCHITECTURE.md` §7.2 |
| Boot/restore físico: `verifyAndRestorePhysicalBackup()` repõe **`local_assets`** | `ARCHITECTURE.md` §7.4 |
| Existe leitura de `ativos` em código (`countAtivos()`) — **a confirmar por grep** no repositório real | `CHANGELOG.md` |
| Supabase tem **somente `assets`** (sistema de registro; 10 tabelas, `tenantid` + `filial`) | `ARCHITECTURE.md` §7.6 |

### 2.3 Veredito (DBA)

É **redundância real**, não intenção de design:

- A intenção original era **DUAS** tabelas com papéis distintos (baseline carregado ×
  alterações para comparação).
- O que existe hoje são **TRÊS** tabelas escritas em bloco pelo loader → começam
  idênticas e, se qualquer fluxo escrever em uma e ler de outra, **divergem
  silenciosamente** — exatamente os “erros internos” que queremos evitar.
- `ativos` é o **nome legado (pt)** que sobrou de uma era anterior.
- `local_assets` carrega, na prática, o papel de “dados locais carregados/restaurados”
  (é o alvo do backup `.dat` e do restore de boot).
- `assets` é a tabela que **casa com a nuvem** (`assets` no Supabase, sync, RLS).

---

## 3. Modelo-alvo (Consolidação + Comparação)

### 3.1 Papéis (mapeamento aprovado)

| Tabela | Papel | Escrita | Leitura | Sync → Supabase |
|---|---|---|---|---|
| **`assets`** | **CANÔNICA / OPERACIONAL** | loader + operações de auditoria (conferência, baixa, etiquetagem, novos) | todas as telas (Inventory, Dashboard, Consultation, AssetMap, AssetDetail) | **SIM → `assets`** |
| **`local_assets`** | **BASELINE CARREGADO (referência imutável)** | somente carga e restore de backup | serviço de **comparação**, restore, export de segurança | NÃO |
| **`ativos`** | **LEGADO → descontinuar** | (hoje: triple-write do loader) | (a confirmar: `countAtivos` e afins) | NÃO |

### 3.2 Dinâmica do app (fluxo de consolidação + comparação)

```
CARGA (DATABASE_MANAGER)
  ├─ escreve assets (canônico/operacional)
  └─ escreve local_assets (snapshot baseline como veio da planilha)
  └─ guarda de consistência pós-carga: count/checksum local_assets == assets

AUDITORIA (campo)
  └─ lê/escreve SOMENTE assets (via AssetRepository na Fase 1)

COMPARAÇÃO (escopo “consolidação + comparação”)
  └─ diff assets × local_assets por primarykey em [tenantid+filial]
     ├─ CONFERIDO          (sem divergência)
     ├─ DIVERGENTE         (campo alterado: qt, endereço, serial, status…)
     ├─ BAIXA              (databaixa / _is_divergent_baixa)
     ├─ SOBRA / NOVO       (existe em assets, não em local_assets)
     └─ NÃO_ENCONTRADO     (existe em local_assets, ausente/_is_deleted em assets)
  └─ consolidação: aplica correções aprovadas em assets + grava audit_logs

SYNC (Supabase)
  └─ assets (local) ⇄ assets (nuvem) — bidirecional, LWW _lastUpdated/_version
  └─ local_assets NUNCA sobe (referência local); ativos nem existe mais
```

### 3.3 Resposta direta à pergunta do usuário

**Qual tabela local deve atualizar o Supabase? → `assets`.**

Justificativa (lógica):
1. É a **única das três que existe na nuvem** (`assets`);
2. As **~30 funções de sync já prontas** miram `assets` (`syncAssetsToCloud`,
   `fetchFullInventory`, `subscribeToAssetChanges`, `uploadAssetPhoto`…);
3. **RLS e interceptor de colunas** (`mapColumnName`) já operam sobre `assets`;
4. `local_assets` precisa **continuar imutável** para a comparação funcionar — subir
   alterações a partir dela destruiria o papel de baseline;
5. `ativos` é legado e será descontinuado.

---

## 4. Plano de execução (garantias anti-perda)

1. **Verificação no repositório real (pré-requisito)** — `src/` não está presente neste
   workspace; antes de qualquer mudança, mapear os touchpoints por tabela (grep em §6.1)
   e listar leituras/escritas de `ativos` vs `assets` vs `local_assets`.
2. **Fase 1 (repositórios):** `AssetRepository` nasce lendo/escrevendo **`assets`**;
   `LocalAssetsRepository` **somente-leitura** (baseline); **`ativos` fora do contrato**
   (nenhum touchpoint novo usa `ativos`; dual-read temporário com log de divergência se
   algum fluxo antigo ainda o ler).
3. **Migração Dexie `version(5)`** (depois de validado): migrador **idempotente com
   dry-run** que copia divergências de `ativos` → `assets` (por `primarykey`) e **remove
   `ativos`**. Atualizar `SCHEMA_BASELINE.md` + `schemaBaseline.test.ts` (9 → 8 tabelas,
   assert de proibição de escrita em `local_assets`/`ativos`).
4. **Backup/restore:** o `.dat` físico passa a cobrir **`assets` + `local_assets`** (hoje
   só `local_assets`); o export de segurança da Fase 0 já cobre as 9 tabelas do manifesto —
   manter.
5. **Critérios de aceite:** zero perda (contagem + checksum por tabela antes/depois);
   testes verdes; `tsc` limpo; rollback = commit anterior + flag.

---

## 5. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Algum fluxo ainda lê `ativos` e some | grep prévio (§6.1) + dual-read temporário na Fase 1 com log |
| Restore `.dat` sobrescrever o trabalho em andamento | backup passa a incluir `assets`; restore de baseline não apaga `assets` (merge por `primarykey`) |
| Divergência silenciosa entre espelhos durante a transição | guarda de consistência pós-carga + teste de contrato proibindo escrita dupla |
| Perda de dados na `version(5)` | migrador idempotente, dry-run e checksum por tabela (padrão Fase 0) |

---

## 6. Anexos

### 6.1 Grep de verificação (rodar no repositório real)

```bash
rg -n "db\.ativos|\.ativos\.|table\(['\"]ativos['\"]\)" src/ | head -50
rg -n "db\.assets|\.assets\." src/ | head -50
rg -n "db\.local_assets|\.local_assets\." src/ | head -50
```

### 6.2 Supabase — conferência sugerida (read-only)

```sql
-- baseline atual na nuvem
select count(*) from assets;
-- distribuição por tenant/filial (órfãos fora do padrão)
select tenantid, filial, count(*) from assets group by 1, 2 order by 3 desc;
```

### 6.3 Decisão de papéis (confirmada em 2026-08-06)

- [x] `assets` = **canônica/operacional** + sync → Supabase `assets`
- [x] `local_assets` = **baseline imutável** para comparação
- [x] `ativos` = **descontinuar** na Fase 1 (`version(5)`)
