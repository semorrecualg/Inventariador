-- ============================================================================
-- GBR KARDEK · PODA DE PAPÉIS LEGADOS (RBAC)
-- ----------------------------------------------------------------------------
-- Objetivo: remapear registos antigos de public.user_permissions.role para os
-- papéis canónicos, SEM excluir utilizadores e SEM perder acesso:
--
--   GESTOR            -> ADMIN    (tinha acesso total; ADMIN preserva-o)
--   AUXILIARY_AUDITOR -> AUDITOR  (papel fundido; mesmo pacote B + C)
--
-- A coluna é text e não tem CHECK de domínio: a migração é só de dados.
-- Idempotente: pode correr mais de uma vez, com qualquer caixa/espaço à volta.
-- Referência de governança: docs/RBAC_GOVERNANCA.md § 2.
-- ============================================================================

begin;

-- 1. Fotografia ANTES (tem de ficar vazia no passo 2).
select role, count(*) as registos
from public.user_permissions
where upper(btrim(coalesce(role, ''))) in ('GESTOR', 'AUXILIARY_AUDITOR')
group by role
order by role;

-- 2. Remapeamento.
update public.user_permissions
set role = 'ADMIN'
where upper(btrim(coalesce(role, ''))) = 'GESTOR';

update public.user_permissions
set role = 'AUDITOR'
where upper(btrim(coalesce(role, ''))) = 'AUXILIARY_AUDITOR';

-- 3. Verificação: 0 linhas = nenhum papel legado restante.
select count(*) as legados_restantes
from public.user_permissions
where upper(btrim(coalesce(role, ''))) in ('GESTOR', 'AUXILIARY_AUDITOR');

-- 4. Distribuição final (ADMIN, MASTER, AUDITOR, USER, DEMO, MOBILE_SINGLE).
select role, count(*) as registos
from public.user_permissions
group by role
order by role;

commit;

-- Nota: dispositivos offline podem manter a grafia antiga no SQLite local até
-- sincronizarem. O cliente lê `AUXILIARY_AUDITOR` como `AUDITOR`
-- (src/utils/roles.ts), por isso esse intervalo não retira acesso a ninguém.
