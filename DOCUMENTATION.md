# Documentação Técnica e Operacional - GBR v24.50 KARDEK

Este documento serve como o manual oficial e registro técnico de todas as funcionalidades operacionais do sistema de Inventário de Ativo Imobilizado (GBR v24.50).

---

## 1. Visão Geral do Sistema
O **GBR v24.50 KARDEK** é uma solução avançada para gestão de inventário físico de ativos imobilizados, projetada para auditores e gestores de patrimônio. O sistema foca em precisão, rastreabilidade e integração com ERPs (especificamente Protheus SIGAATF).

### 1.1. Pilares do Sistema
- **Protocolo GBR v24**: Regras rigorosas de eliminação e tratamento de dados (Ativos vs. Baixados).
- **Integração Protheus**: Sincronização direta via `Sn1_recno`.
- **Mobilidade**: Interface otimizada para dispositivos móveis com suporte a QR Code e Scanner.
- **Segurança**: Controle de acesso por perfis (ADMIN e AUDITOR).

---

## 2. Arquitetura e Tech Stack
- **Frontend**: React 18+ com TypeScript.
- **Estilização**: Tailwind CSS (Design System GBR).
- **Ícones**: Lucide React.
- **Processamento de Dados**: XLSX (SheetJS) para carga de planilhas.
- **QR Code**: QRCode.react para geração dinâmica.
- **Backend/Sincronização**: Firebase (Firestore e Auth) para persistência em nuvem.

---

## 3. Perfis de Usuário e Permissões

| Perfil | Permissões |
| :--- | :--- |
| **ADMIN** | Gestão de usuários, configuração de campos editáveis, configuração de QR Code, carga de banco de dados, visualização de performance global. |
| **AUDITOR** | Realização de inventário, consulta de ativos, edição de campos permitidos, sincronização com Protheus. |

---

## 4. Módulos Operacionais

### 4.1. Carga de Dados (Database Loader)
- **Protocolo de Importação**: Suporta arquivos `.xlsx` e `.csv`.
- **Mapeamento v24**: Identifica automaticamente 18 colunas críticas (Empresa, Status, Etiqueta, etc.).
- **Sn1_recno**: Captura obrigatória do identificador do Protheus para integração.
- **Regras de Eliminação (GBR v24)**:
  - Itens baixados com contas contábeis específicas (131105001/002) são eliminados.
  - Itens baixados sem etiqueta são eliminados.
  - Itens baixados cuja etiqueta já existe em um registro ativo são eliminados para evitar duplicidade.

### 4.2. Inventário Físico
- **Seleção de Local**: O auditor seleciona a unidade e o endereço antes de iniciar.
- **Modos de Leitura**:
  - **Scanner**: Uso da câmera para leitura de QR Code/Código de Barras.
  - **Manual**: Digitação da etiqueta via teclado numérico otimizado.
- **Feedback Visual**: Cores indicativas de status (Pendente, Conferido, Divergência, Baixado).

### 4.3. Consulta e Busca Avançada
- Filtros múltiplos: Etiqueta, Descrição, Serial, CNPJ, NF, Endereço, Conta, Centro de Custo e **ID Protheus (RECNO)**.
- Busca por intervalo de data de aquisição.
- Modo de retorno ao inventário para itens localizados fora da rota original.

### 4.4. Detalhes do Ativo (Kardex)
- Visualização completa de 5 grupos de dados: Identificação, Localização, Aquisição, Controle Contábil e Dados do Inventário.
- **Edição Controlada**: Apenas campos configurados pelo ADMIN podem ser alterados pelo AUDITOR.
- **Geração de QR Code**: Baseado em campos configuráveis para etiquetas de campo.

---

## 5. Integração Protheus (SIGAATF)
O sistema possui um módulo dedicado para comunicação com o ERP TOTVS Protheus.

- **Identificador**: `Sn1_recno`.
- **Campos Sincronizados**: Filial (`N1_FILIAL`), Código Base (`N1_CBASE`), Local (`N1_LOCAL`), Centro de Custo (`N3_CCUSTO`), etc.
- **Operação**: O botão "Sincronizar Protheus" no detalhe do ativo envia as alterações realizadas no inventário diretamente para a API do ERP.

---

## 6. Configurações Administrativas
- **Campos Editáveis**: Define quais informações o auditor pode alterar no campo.
- **QR Code Configurator**: Define quais dados serão codificados na etiqueta QR.
- **User Management**: Criação e edição de credenciais de acesso.
- **Performance Global**: Gráficos de progresso (D3.js/Recharts) por empresa e status.

---

## 7. Procedimentos de Manutenção
- **Limpeza de Dados**: Realizada via menu "Dados" (Purge).
- **Sincronização Cloud**: O sistema detecta alterações locais e solicita sincronização com o Firebase para manter a base centralizada.

---
*Documentação atualizada em: 18 de Março de 2026*
*Versão do App: 24.50.03*
