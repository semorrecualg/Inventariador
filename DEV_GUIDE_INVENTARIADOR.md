# 📘 Guia de Desenvolvimento: Função INVENTARIADOR (v2.6.6 Native Ready)

Este documento define os padrões inegociáveis para a interface e persistência de dados do módulo de inventário industrial.

## 1. Identidade Visual (Cromatismo Funcional)
Toda a UI deve comunicar segurança e precisão técnica:
- **Azul Cobalto (#1E40AF)**: Ação Principal. Indica persistência física iminente.
- **Verde Esmeralda (#10B981)**: Integridade Garantida. Badge "SAFE" e itens conferidos.
- **Amarelo Ouro (#F59E0B)**: Atenção/Pendente. Itens que aguardam verificação de campo.
- **Vermelho Alerta (#EF4444)**: Divergência Crítica ou Bateria Crítica.

## 2. Protocolo de Sobra Física (Novo Item)
Ao identificar um ativo não cadastrado:
1. **Geração de ID**: UUID v4 local (Soberania de ID).
2. **TAG**: `TAG_INVENTARIO` obrigatoriamente setado como `NOVO`.
3. **Metadados Industriais**:
   - `_origemTransacao`: 1000
   - `_conferido`: 1
   - `_status_sinc`: 0 (Indica origem 100% Offline)
4. **Hardware**: Captura obrigatória de GPS (`_lat`, `_lng`) no momento da criação.

## 3. Check-point de Integridade (Efetivar e Salvar)
O ato de salvar não é apenas um update de estado React, é um commit atômico no Filesystem:
- **Validação**: Verificar se o `_tenantid` e `_unitid` estão presentes.
- **Escrita Local**: `sqliteService.bulkInsertAssets` (UPSERT).
- **Trilha de Auditoria**: Registro imediato na tabela `AUDIT_LOG` local.

## 4. Regras de Segurança de Hardware
- **Bateria < 5%**: Bloquear ou alertar fortemente antes de operações de escrita para evitar `SQLITE_CORRUPT`.
- **Modo Offline**: Tratar `TypeError: Failed to fetch` como comportamento esperado, nunca como erro fatal.
