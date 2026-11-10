# INVENTÁRIO · Contrato da tela (campos, validações e checks)

> **Componente:** `src/components/Inventory.tsx` (+ `AssetListItem.tsx`, `Scanner.tsx`,
> `GPSComplianceGuard.tsx`) · **Rota:** `/inventory` · **AppScreen:** `INVENTORY`
> **Fonte da verdade dos dados:** `Asset` (`src/types.ts`) e baseline Dexie v7
> (`docs/SCHEMA_BASELINE.md`).
>
> Este documento registra **o que a tela precisa contemplar** e **onde cada regra
> vive**. A coluna *Estado* usa: **OK** (renderizado e ligado), **Restaurado**
> (existia como código morto e voltou a estar acessível), **Fora** (regra de outra
> tela, referenciada aqui para não ser reimplementada).

---

## 1. Duas fases da mesma tela

| Fase | Quando | Conteúdo |
|---|---|---|
| **A · Seleção de localidade** | `isInventorying === false` | lista de endereços com progresso, busca de local, aviso de âncora GPS, banner offline, FAB "Nova Localidade" |
| **B · Execução** | `isInventorying === true` | cabeçalho de contexto, progresso, filtros, busca por etiqueta, ajustes de campo, lista virtualizada, barra de ação (lote/encerramento) |

O isolamento é triplo: a tela só recebe `assets` da unidade selecionada
(`filteredAssetsByUnit`), aplica filtro de unidade (`belongsToUnit`, tolerante a
`filial`/`_unitid`/código numérico) e **filtro estrito por endereço** — a lista
sem termo de busca é exatamente o universo do endereço selecionado
(`addressAssets`), usando a mesma chave do `AddressSelector`:
`_localMaster || endereco || LOCALIZACAO || CENTRO_CUSTO || 'SEM LOCAL'`
(normalizada). A busca manual continua varrendo a unidade inteira, pois é ela que
localiza ativos para adoção e busca global.

`addressAssets` lê `assets` (subconjunto indexado da unidade) e completa com
`allAssets` (base carregada), sem duplicar por `id` — se a carga indexada vier
vazia ou desatualizada (campanha/sync), o endereço ainda lista o que existe na
base. Ao escolher um endereço, o `App.tsx` grava `current_selected_address` **e**
`inventoryLocation`; sem essa sincronização a tela abria com o endereço anterior
(nulo) e devolvia lista vazia + `0/0`.

A carga indexada (`fetchUnitAssets`) filtra por campanha **somente quando o ativo
tem `currentCampaignId` gravado** — ativos de uma base recém-carregada, ainda sem
vínculo de campanha, continuam aparecendo no endereço (antes eram descartados e a
tela ficava vazia em todos os endereços).

---

## 2. Campos exibidos

### 2.1 Cabeçalho e contexto (fase B)

| Campo | Origem | Estado |
|---|---|---|
| Endereço físico selecionado | `current_selected_address` (sessionStorage) + `selectedLocation` | OK |
| Localidade em auditoria | prop `selectedLocation` | OK |
| Temperatura do aparelho | `telemetryService.getDeviceMetrics()` | OK |
| Bateria (%) | idem | OK |
| Conferidos / total da localidade | derivado de `assets` (regra do hub) | **Restaurado** |
| Barra e percentual de progresso | derivado | **Restaurado** |
| Consulta manual por ETIQUETA | campo fixo no cabeçalho (mesma busca por etiqueta/descrição) | **Movido para o topo** |

### 2.2 Linha do ativo (`AssetListItem`)

| Campo | Regra de exibição |
|---|---|
| Etiqueta / patrimônio | `formatEtiqueta(asset.etiqueta)` |
| Quantidade, descrição, série, data de aquisição | linha única `qt; descrição; S/N; mês/ano` |
| Foto | ícone quando `_photoUrl` ou foto local (`photoService`) |
| **TAG de auditoria** | `resolvePersistedTag()` — bloco sólido e colorido sempre visível (ver § 2.5), + faixa lateral na cor da tag |
| Baixa | faixa vermelha permanente "Baixado na base mestre — status permanente" quando `status` contém BAIXA ou `databaixa` preenchido |
| Adoção externa | faixa escura/âmbar "Adotado externo — registro de outra empresa" + anel âmbar no cartão |
| Divergência crítica | ícone + "Divergência Crítica" quando `_is_divergent_baixa` |
| Sincronização | `_is_synced` → "Sincronizado" / "Pendente Nuvem" |
| Registro | `asset.registro` |
| Data/hora da leitura | `_dataLeitura` (somente fora de adoção) |
| Origem → destino (adoção) | bloco de comparação: `endereco` (base) → `_localMaster`/local atual |
| QR Code | botão abre o modal com `QRCodeSVG` |
| Ação de conferência | botão circular → `handleMakeDecision` |

### 2.3 Modais da fase B

| Modal | Campos | Ações |
|---|---|---|
| Confirmar inventário | patrimônio, descrição, local de origem (filial/endereço) x novo local, aviso de baixa + `databaixa` | Cancelar · Confirmar · Confirmar + Foto |
| Item já conferido / conflito de localização | patrimônio, descrição, "Local do Registro" | Entendido |
| Não localizado | código lido | Incluir Manual · Voltar |
| Busca global (divergência) | etiqueta, resultados de todas as filiais | Vincular à unidade · Incluir manual |
| Novo registro (inclusão manual) | etiqueta, descrição, nº de série, quantidade, unidade, local (GPS), status NOVO ITEM | Salvar e Conferir |
| QR Code | etiqueta, QR renderizado | Fechar |

### 2.5 Tags de auditoria — Regras de Ouro

> **Motor:** `src/services/tagService.ts` (`determineAssetTag`, `resolvePersistedTag`,
> `TAG_POLICY`). **Renderização:** `AssetListItem.tsx` (lista), `AssetDetail.tsx`
> (ficha), `PublicKardex.tsx` (consulta pública). **Persistência:** campo
> `TAG_INVENTARIO` do ativo, gravado no ato da conferência.

| TAG | Regra | Cor da faixa / cartão |
|---|---|---|
| **PENDENTE** | `STATUS = ATIVO` no `endereco` original, ainda não conferido | **Cinza aço** (`slate-600`) |
| **BAIXADO** | `STATUS` contém BAIXA **ou** `databaixa` preenchido — **permanente e imutável**: continua BAIXADO mesmo localizado fisicamente | **Vermelho crítico** (`red-600`) |
| **CONFERIDO** | localizado exatamente no `endereco` original da base mestre | **Verde esmeralda** (`emerald-600`) |
| **ADOTADO** | localizado em endereço diferente do original, mas da mesma empresa | **Indigo/azul** (`indigo-600`) |
| **RE-ADOTADO** | já conferido em um endereço e reencontrado em outro durante o inventário | **Violeta/fúcsia** (`fuchsia-600`) |
| **NOVO ITEM** | inclusão manual, fora da malha original | **Laranja** (`orange-600`) |
| **ADOTADO EXTERNO** | etiqueta de outra empresa, trazida pela busca global | **Preto + âmbar** (`slate-950` / `amber-300`, com anel) |
| **DIVERGÊNCIA** | etiqueta física ≠ `_plaquetaMaster`, ou `STATUS` ATIVO com `databaixa` (regra de ouro) | **Rose/vermelho** (`rose-600`) |
| **FALTA ETIQUETAR** | plaqueta mestre (ou etiqueta física) com a instrução `ETIQUETAR` e emplaquetamento **não confirmado** | **Âmbar/amarelo** (`amber-400`) |
| **ETIQUETADO** | era FALTA ETIQUETAR e o auditor confirmou a etiquetagem (`_plaquetado` / `TAG_INVENTARIO = ETIQUETADO`) | **Violeta** (`violet-600`) |

Regras de cálculo (`determineAssetTag`, na ordem):

1. `STATUS` ATIVO + `databaixa` → **DIVERGÊNCIA** (regra de ouro) antes de tudo.
2. Baixado (BAIXA ou `databaixa`) → **BAIXADO**, sempre — inclusive conferido.
3. `_plaquetaMaster = ETIQUETAR` (ou etiqueta física `ETIQUETAR`) → **FALTA
   ETIQUETAR**; só vira **ETIQUETADO** com confirmação explícita do
   emplaquetamento (`_plaquetado`). Conferir a presença do bem **não** conclui
   a etiquetagem.
4. `filial` diferente da unidade em auditoria → **ADOTADO EXTERNO**.
5. `_isNew` / `TAG_INVENTARIO = NOVO ITEM` → **NOVO ITEM**.
6. Etiqueta atual ≠ plaqueta mestre → **DIVERGÊNCIA**.
7. Não conferido → **PENDENTE**.
8. `_localMaster` diferente do local em auditoria → **RE-ADOTADO**.
9. `endereco` original igual ao local em auditoria → **CONFERIDO**; caso contrário **ADOTADO**.

**Persistência e retorno ao usuário**

- `TAG_INVENTARIO` é calculada **sobre o estado anterior** (antes de gravar
  `_localMaster`) e gravada junto com `_conferido`, para não perder RE-ADOTADO.
- Tags de decisão explícita (`ADOTADO EXTERNO`, `NOVO ITEM`, `RE-ADOTADO`) são
  preservadas por `resolvePersistedTag` em vez de recalculadas.
- A conferência de um baixado **não** sobrescreve `status` com `CONFERIDO`.
- Coluna do arquivo de retorno: `AUDITOR_TAG_REGRA_OURO`
  (`App.tsx` e `Dashboard.tsx`) — lê exatamente `TAG_INVENTARIO`; o PDF do BOOK
  (`reportGenerator.ts`), o termo (`Signature.tsx`) e a impressão
  (`AssetPrintView.tsx`) também exibem a coluna.
- **ADOTADO EXTERNO (5.1/5.2):** só é oferecido a partir da etiqueta **digitada
  manualmente** que não existe na unidade → botão "Buscar em outras empresas" no
  estado vazio → `findAllByEtiqueta` → modal lista empresas/status (ATIVO ou
  BAIXADO) → "Vincular a esta Unidade".

### 2.4 Fase A (seleção de localidade)

| Campo | Regra |
|---|---|
| Código e nome do local | primeiro token é código; restante é nome |
| Itens conferidos / total | `getLocationsWithStats()` |
| Percentual + barra | `checked / total` |
| Busca de local | debounce 300 ms, filtra por prefixo do código |
| Âncora GPS ausente | bloco vermelho com ação "Reconfigurar Âncora (MAPA)" |
| Offline / buffer | `DatabaseMode.INTERNAL` → banner + `BufferIndicator` |

---

## 3. Validações e checks

### 3.1 Bloqueios de entrada

| # | Check | Comportamento |
|---|---|---|
| 1 | **Geofence / GPS** (`GPSComplianceGuard`) | valida lat/lng contra `UnitConfig.radius_meters` (Turf); fora do raio não abre a tela (perfis ADMIN/MASTER/GESTOR têm bypass) |
| 2 | **Âncora GPS da unidade** (`unitConfig` nulo) | fase A bloqueia abertura de localidade e criação de local, exceto bypass `isAdminEmail` |
| 3 | **Fila de sincronização** (`isSyncLocked` em `App.tsx`) | acima de `MAX_SYNC_QUEUE_SIZE` a tela é substituída por "Sistema Bloqueado" (exceto admin) |
| 4 | **Motor Dexie** | enquanto `sqliteService` não inicializa → tela "RE-INICIALIZANDO SISTEMA GBR" |

### 3.2 Checks de leitura

| # | Check | Comportamento |
|---|---|---|
| 5 | Debounce de leitura | mesma etiqueta em < 2 s é ignorada |
| 6 | Modal aberto | leituras ignoradas enquanto há modal (`scannedAsset`, `scannedResult`, duplicado, inclusão manual) |
| 7 | Resfriamento | 500 ms entre leituras |
| 8 | Temperatura | > 48 °C bloqueia o scanner; < 45 °C libera |
| 9 | Inatividade | 30 s sem leitura → standby térmico (toque retoma) |
| 10 | Lanterna | auto-off em 15 s |

### 3.3 Checks de integridade do ativo

| # | Check | Comportamento |
|---|---|---|
| 11 | **Filial** | ativo de outra `filial` adotado automaticamente como `ADOTADO_EXTERNO`, com atualização de filial e `_localMaster` |
| 12 | **Endereço** | mesma filial e endereço diferente → `ADOTADO` (sobra física no De/Para) |
| 13 | **Já conferido** | clique não abre a ficha; abre o modal "Item já Conferido"/"Conflito de Localização" |
| 14 | **Etiqueta duplicada** (`TAG_DUPLICIDADE = ETIQUETA+1REGISTRO`) | confirma todos os registros pendentes da mesma etiqueta na filial/unidade |
| 15 | **Baixa ativa** (`_is_divergent_baixa`) | modal vermelho "Divergência Crítica" com `databaixa` antes de confirmar |
| 16 | **Ativo baixado** | não entra na lista de pendentes; ao ser localizado é registrado e aparece em "Conferidos" **permanentemente como BAIXADO** (o `STATUS` de baixa não é sobrescrito) |
| 17 | **Não localizado** | grava `DIVERGENCIA` em `audit_logs` e oferece busca global / inclusão manual |
| 18 | **Busca por descrição** | termo não numérico procura em `descricaodoativo` (não só etiqueta) |
| 19 | **Resultado em lote** | vários registros com a mesma etiqueta → botão "Conferir os N registros do resultado" |
| 20 | **Modo lote** | seleção múltipla; `handleBatchConfirm` confirma **apenas** os não conferidos |
| 21 | **Persistência espelhada** | grava cópia em `localStorage` (`gbr_backup_<tenant>_<filial>`) antes de atualizar; recovery boot reinjeta órfãos |

### 3.4 Checks de gravação

| # | Check | Comportamento |
|---|---|---|
| 22 | Tenant/filial canônicos | `cleanAndCapitalizeAsset` normaliza `tenantid`/`filial` em maiúsculas e rejeita tenant vazio ("Erro de Governança") |
| 23 | Auditoria | cada conferência grava `CONFERENCIA` (ou `DIVERGENCIA`) em `audit_logs` via `localDb` |
| 24 | Local-first | atualização em `localDb.assets` + `_is_synced = 0`; a nuvem sobe depois pelo sync |
| 25 | Novo item | `_isNew = true`, `TAG_INVENTARIO = NOVO_ITEM`, `_conferido = true`, `currentCampaignId` da campanha ativa, `endereco`/`AUDITOR_LOCAL_AUDITADO` = local atual |
| 26 | Encerramento | "Finalizar lote" abre a `SIGNATURE` (assinatura do auditor) |
| 27 | TAG de auditoria | `TAG_INVENTARIO` calculada e gravada em toda confirmação (scanner, decisão na lista, modal, lote); coluna de retorno do inventário |
| 28 | **Escopo de endereço** | sem termo de busca, a lista só contém ativos cujo endereço efetivo (`_localMaster` → `endereco` → `LOCALIZACAO` → `CENTRO_CUSTO`) é o do endereço escolhido; o estado vazio informa o endereço e a aba (pendentes/conferidos) |

### 3.5 Regras que vivem em outra tela (não duplicar aqui)

| Regra | Onde |
|---|---|
| Foto obrigatória em divergência / novo item | `AssetDetail.tsx` (toggles do Painel Completo → Evidência Fotográfica) |
| Campos editáveis da ficha e campos do QR | `AssetDetail.tsx` / `FieldConfigurator.tsx` (`editableFields`, `qrCodeFields`) |
| Edição de endereço, conta, centro de custo, valor, fornecedor, NF | FICHA DO ATIVO (`AssetDetail`) |
| Termo de aceite e assinatura | `Signature.tsx` |
| Criação/edição de localidades | `UnitConfigurator` / modal "Nova Localidade" |

---

## 4. O que estava inacessível e foi restaurado

A tela tinha as funções implementadas, mas sem gatilho na interface — várias
presas em um bloco `if (isOfflineValidationEnabled)` (constante `false`) usado
apenas para calar o ESLint:

| Item | Antes | Depois |
|---|---|---|
| Campo de busca | `readOnly` e o teclado numérico nunca era renderizado → **impossível digitar** | input editável no **cabeçalho** (etiqueta e descrição), no lugar da barra grande acima da lista |
| Teclado numérico | componente morto | removido (não servia para busca por descrição) |
| Busca por foto (OCR) | botão chamava `ocrInputRef.click()` sem `<input type="file">` na árvore → inerte | **removida**: apontava para `/assets/ocr/*` inexistente e falhava em silêncio; a leitura fica com o leitor de câmera (código de barras/QR) |
| Progresso da localidade | só na fase A | barra + `conferidos/total/%` no cabeçalho e na barra de ação |
| Modo lote | estado inalcançável | botão no cabeçalho + barra "selecionados / Conferir / Cancelar" |
| Finalizar lote | `onOpenSignature` sem botão | "Finalizar lote" na barra de ação |
| Conferir resultado da busca | `handleConfirmSearchBatch` sem botão | botão quando há vários registros da mesma etiqueta |
| Incluir novo registro | `handleCreateNew` sem botão | botão no estado vazio com termo buscado |
| Digitar código manualmente (leitor) | abria direto o formulário **NOVO REGISTRO** | fecha a câmera e devolve o foco à busca para digitar o código; a criação continua em "Incluir novo registro" |
| Formulário de novo registro | `onChange` gravava `ETIQUETA`/`DESCRICAODOATIVO`/`SERIAL`/`QT` (maiúsculas) enquanto os `value` liam minúsculas → **campos não aceitavam texto** | bindings corrigidos (`etiqueta`, `descricaodoativo`, `serial`, `qt`) + `endereco` do local atual |
| Restauração de scroll | `handleRangeChanged` nunca ligado ao Virtuoso | `rangeChanged` conectado |
| `isSearchVisible` / `showScrollTop` | estado morto | removido |

---

## 5. Pendências conhecidas (não implementadas)

1. **Flags de `unit_configs`** (`requireNf`, `requireSeriado`, `requirePlaqueta`,
   `allowNewAssets`, `allowWriteOffs`, `hasGps`) existem na tabela Dexie, mas **não**
   no tipo `UnitConfig` consumido pela UI — nenhuma tela as valida hoje.
2. **Filtros de lista** limitam-se a `Ativos` / `Conferidos`; não há filtro por
   conta contábil, centro de custo, faixa de valor ou divergência.
3. **Campos contábeis** (conta, centro de custo, valor, fornecedor, NF, recnos
   Protheus) aparecem na ficha do ativo, não na linha do inventário.
4. **Foto obrigatória** é aplicada na ficha (`AssetDetail`), não no momento da
   confirmação na lista.
5. **DIVERGÊNCIA no EMPLAQUETAR** (plaqueta de substituição) é apenas exibida na
   tela de etiquetagem; não há fluxo dedicado de troca de plaqueta com registro
   da etiqueta antiga → nova.
