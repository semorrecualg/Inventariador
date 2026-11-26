# GBR KARDEK v2.6 - MAPA MESTRE DE NAVEGAÇÃO E DEPENDÊNCIAS
## AUDITORIA GERAL DE SRE & GOVERNANÇA INDUSTRIAL

Este mapa documenta a topologia e as conexões físicas dos mais de 35 componentes e barramentos que estruturam o ecossistema reativo híbrido **GBR KARDEK (versão 2.60)**.

---

## 1. GRAFO DE DEPENDÊNCIAS E FLUXO DE COMPONENTES

```
+---------------------------------------------------------------------------------+
|                                 TELA DE LOGIN                                   |
|                                  (Login.tsx)                                    |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|              SELETOR DE CONTRATO/FILIAL PÓS-LOGIN (multi-contrato)             |
|                        (TenantWorkSelector.tsx)                                |
|   - Ativado quando buildWorkContexts(user) > 1; escolhe o tenantid + filial    |
|   - Ao escolher: persiste contexto e sincroniza SOMENTE o contrato escolhido   |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                       SELEÇÃO DE MÓDULOS / CONTAINER RAIZ                      |
|                               (ModuleSelector.tsx)                             |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|         CONTRATO DE TRABALHO · UNIDADE OPERACIONAL  (WorkContextSelector.tsx)  |
|   - Contrato + filial + módulo, com contagem de ativos por filial             |
|   - Geocerca (âncora × posição), carga de base e sincronização                |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                    SELETOR DE ENDEREÇO FÍSICO (ANCHOR)                          |
|                             (AddressSelector.tsx)                               |
|        - Retorna contagem de ativos indexados no banco local (Dexie)           |
|        - Armazena 'current_selected_address' sob SessionStorage                 |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                          CONTROLE DE FLUXO DE CAMPO                             |
|                             (Inventory.tsx)                                     |
|        - Executa filtro estrito com base em endereço (Dexie, escopo tenant)    |
|        - Gerência renders via Virtuoso virtualizado                             |
+---------------------------------------------------------------------------------+
                  /                      |                      \
                 /                       |                       \
                v                        v                        v
+----------------------+      +----------------------+      +----------------------+
|       SCANNER        |      | ETIQUETAGEM & SOESP  |      |   TERMO DE ACEITE    |
|    (Scanner.tsx)     |      |    (Labeling.tsx)    |      |   (Signature.tsx)    |
+----------------------+      +----------------------+      +----------------------+
```

---

## 2. BARRAMENTOS DE CONTROLE OPERACIONAL

### Barramento A: Fluxo Crítico e Captura de Campo (Esteira Operacional)
- **`Login.tsx`**: Ponto inicial de controle de acesso — **login por contrato** (usuário × `tenantid`): o perfil vem do `user_permissions` na nuvem; a Barreira Local bloqueia admin/master sem contrato (nunca "GLOBAL"). O backdoor MASTER DRIVE foi **removido**.
- **`TenantWorkSelector.tsx`**: Seletor de contrato/filial pós-login (multi-contrato) — persiste o contexto e sincroniza apenas o contrato escolhido.
- **`ModuleSelector.tsx`**: Roteador de módulos (Gestor de Base / Inventariador / Controle de Ativo) baseado nos privilégios do operador.
- **`MainMenu.tsx`**: Hub operacional do auditor — o **Painel Completo** concentra os painéis **Gestão e Manutenção** (ADMIN) e **Auditoria e Concordância** (TRILHA B), além dos itens administrativos (RBAC via `rbacService`/`PermissionGate`); a tool grid que vivia na antiga Unidade Operacional deixou de existir com a fusão no contrato. O cartão **Banco de Dados** é o caminho do menu para o `DatabaseManagerScreen`; dentro da Gestão e Manutenção o atalho **«ABRIR O GESTOR DE BASE»** abre o mesmo ecrã — fonte única dos contadores, da carga, da purga e dos logs SRE. A Gestão e Manutenção fica com a configuração e as ações do utilizador (modo de base, sincronização, exportações, backup, limpezas, filtros, GPS).
- **`WorkContextSelector.tsx`**: Tela única pós-login (contrato + filial + módulo). Herdou da Unidade Operacional a **contagem de ativos por filial**, a **geocerca**, a **carga de base** e a **sincronização**; os botões de cada cartão abrem a âncora e a campanha da filial.
- **`AddressSelector.tsx` [Novo Componente v2.60]**: Nova âncora de roteamento que isola os inventários por seu endereço nativo coletado do Excel parser. É o **seletor único** de endereço da esteira: concentra a lista/busca de localidades com progresso, o aviso de âncora GPS pendente, o banner de modo offline e o botão «Nova Localidade»; o `Inventory` recebe o endereço já escolhido.
- **`LoadHistoryScreen.tsx`** (`src/screens/`): Histórico de cargas/sincronizações por contrato (lê `audit_logs` — IMPORT/SYNC_PULL), gate `manage_database`.
- **`LicenseProvisioning.tsx`**: Provisionamento de novo cliente — cria MASTER amarrado ao `tenantid` com senha forte (`passwordPolicy`), sem backdoor.
- **`Inventory.tsx`**: O motor nuclear de renderização da listagem de ativos filtrados, com scroll de alta reatividade e cacheamento de posicionamento estático.
- **`Scanner.tsx`**: Leitor de código de barras unidimensional e QR bidimensional pela câmera.
- **`PreferencesPanel.tsx`**: Painel único de Ajustes de Campo (feedback de leitura, auto-conferência, padrão de captura, energia e tema), aberto pelo menu e pelo formulário de inventário.
- **`Labeling.tsx`**: Tratamento independente de controle de sobras, ativos sem etiquetas físicas ou com necessidade de emplaquetamento re-ativo.
- **`Signature.tsx`**: Captura e gravação de assinatura manuscrita eletrônica do auditor no encerramento da campanha operacional de auditoria física.

### Barramento B: Motores Nucleares de Segundo Plano (I/O e Sincronismo)
- **`sqliteService.ts`**: Motor nativo rodando Queries em C++ fatiadas estritamente em blocos de até 200 itens para carga segura em RAM física. Em caso de carga massiva, o mecanismo de salvamento é acoplado unidimensionalmente de forma atômica pós-lotes para otimização térmica de ciclos de disco.
- **`localDbService.ts`**: Camada que mapeia e gera contagens estatísticas em real-time (`getLocationsWithStats`), garantindo isolamento total de Tenants em modo de voo.
- **`syncService.ts`**: Sincronizador de background resiliente a chamadas nulas com silenciamento tático de crashs em caso de offline total ou PGRST204 do Supabase.

---

## 3. ACOPLAMENTO DO ENDEREÇO (A CONEXÃO OCULTA SRE)

O `AddressSelector.tsx` impede o carregamento indiscriminado da base inteira operando sob uma barreira de proteção de I/O em runtime. O fluxo de dados opera da seguinte forma:

1. O operador escolhe a unidade filial no `WorkContextSelector.tsx`.
2. O sistema direciona para o `AddressSelector.tsx`, que consulta o SQLite nativo aplicando `getLocationsWithStats` para computar a quantidade física de ativos associada àquela filial agrupados por endereço de emplaquetamento.
3. Ao selecionar um Endereço Físico (ex: `CORREDOR A`, `GALPÃO CENTRAL`):
   - O identificador de endereço é salvo em cache de sessão sob a chave `current_selected_address`.
4. O `Inventory.tsx` ao ser renderizzato herda esse estado de sessão de forma síncrona — é a **única** seleção de endereço: a antiga fase «Mapeamento» dentro do inventário foi removida por repetir esta mesma lista e consulta.
5. O `App.tsx` carrega os ativos do endereço via **API Dexie** (`localDb`/`sqliteService`, escopo por `tenantid`+`filial`) — sem SQL raw (contrato SRE).
6. O loop de renderização do `Virtuoso` recebe unicamente os ativos pertencentes ao quadrante físico selecionado, reduzindo o tráfego em RAM dos ativos globais do contrato (ex.: 12.636 no CICOPAL) para frações geolocalizadas seguras de máxima performance.
