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
|                       SELEÇÃO DE MÓDULOS / CONTAINER RAIZ                      |
|                       (MainMenu.tsx / ModuleSelector.tsx)                       |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                           SELETOR DE UNIDADE OPERACIONAL                        |
|                               (UnitSelector.tsx)                                |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                    SELETOR DE ENDEREÇO FÍSICO (ANCHOR)                          |
|                             (AddressSelector.tsx)                               |
|        - Retorna contagem de ativos indexados no SQLite local                   |
|        - Armazena 'current_selected_address' sob SessionStorage                 |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                          CONTROLE DE FLUXO DE CAMPO                             |
|                             (Inventory.tsx)                                     |
|        - Executa filtro nativo SQLite estrito com base em endereço              |
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
- **`Login.tsx`**: Ponto inicial de controle de acesso de operadores com bypass institucional seguro homologado para `semorr@gmail.com`.
- **`MainMenu.tsx` / `ModuleSelector.tsx`**: Roteadores principais de fluxos locais/SaaS baseados nos privilégios do operador.
- **`UnitSelector.tsx`**: Carrega unidades e filiais da base local de dados.
- **`AddressSelector.tsx` [Novo Componente v2.60]**: Nova âncora de roteamento que isola os inventários por seu endereço nativo coletado do Excel parser.
- **`Inventory.tsx`**: O motor nuclear de renderização da listagem de ativos filtrados, com scroll de alta reatividade e cacheamento de posicionamento estático.
- **`Scanner.tsx`**: Integração de OCR nativo e leitor de código de barras unidimensional/QR bidimensional.
- **`Labeling.tsx`**: Tratamento independente de controle de sobras, ativos sem etiquetas físicas ou com necessidade de emplaquetamento re-ativo.
- **`Signature.tsx`**: Captura e gravação de assinatura manuscrita eletrônica do auditor no encerramento da campanha operacional de auditoria física.

### Barramento B: Motores Nucleares de Segundo Plano (I/O e Sincronismo)
- **`sqliteService.ts`**: Motor nativo rodando Queries em C++ fatiadas estritamente em blocos de até 200 itens para carga segura em RAM física. Em caso de carga massiva, o mecanismo de salvamento é acoplado unidimensionalmente de forma atômica pós-lotes para otimização térmica de ciclos de disco.
- **`localDbService.ts`**: Camada que mapeia e gera contagens estatísticas em real-time (`getLocationsWithStats`), garantindo isolamento total de Tenants em modo de voo.
- **`syncService.ts`**: Sincronizador de background resiliente a chamadas nulas com silenciamento tático de crashs em caso de offline total ou PGRST204 do Supabase.

---

## 3. ACOPLAMENTO DO ENDEREÇO (A CONEXÃO OCULTA SRE)

O `AddressSelector.tsx` impede o carregamento indiscriminado da base inteira operando sob uma barreira de proteção de I/O em runtime. O fluxo de dados opera da seguinte forma:

1. O operador escolhe a unidade filial no `UnitSelector.tsx`.
2. O sistema direciona para o `AddressSelector.tsx`, que consulta o SQLite nativo aplicando `getLocationsWithStats` para computar a quantidade física de ativos associada àquela filial agrupados por endereço de emplaquetamento.
3. Ao selecionar um Endereço Físico (ex: `CORREDOR A`, `GALPÃO CENTRAL`):
   - O identificador de endereço é salvo em cache de sessão sob a chave `current_selected_address`.
4. O `Inventory.tsx` ao ser renderizzato herda esse estado de sessão de forma síncrona.
5. A função `fetchUnitAssets` no `App.tsx` executa uma query SQLite customizada injetando a restrição estrutural:
   `AND (TRIM(UPPER(ENDERECO)) = ? OR TRIM(UPPER(endereco)) = ?)`
6. O loop de renderização do `Virtuoso` recebe unicamente os ativos pertencentes ao quadrante físico selecionado, reduzindo o tráfego em RAM de 12.637 ativos globais para frações geolocalizadas seguras de máxima performance.
