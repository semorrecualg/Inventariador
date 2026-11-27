# 42501 no envio — o pedido chega como `anon` com o utilizador autenticado

Documento de diagnóstico. Substitui a leitura do #236 («falta de GRANT; abrir
`assets` a `anon`»), que estava errada: o #236 repunha os privilégios de `anon`
e desfazia o endurecimento de RLS do #204.

---

## 1. Sintoma

O cartão do ativo, depois de conferido, mostra:

> FALHA DE ENVIO — `Erro Supabase: [42501] permission denied for table assets`

A base do aparelho continua boa: o ativo foi conferido, ficou guardado e só não
sobe. O ecrã de «SINCRONIZANDO BASE» pode também ficar à espera e só sair pelo
botão «Continuar com a base do aparelho».

## 2. O que o código 42501 diz — e o que não diz

`42501` é recusa de **privilégio**, não de dados: o RLS decide **depois** do
GRANT. Mas o Postgres usa o mesmo código para duas situações diferentes:

| Mensagem do PostgREST | O que é |
|---|---|
| `permission denied for table assets` | o **papel** do pedido não tem privilégio de tabela (é o caso de `anon`, sem sessão) |
| `new row violates row-level security policy` | há sessão, mas a **política** recusou aquela linha (contrato/perfil) |

O #236 leu a primeira como «falta de GRANT para o utilizador» e devolveu
`SELECT/INSERT/UPDATE/DELETE` a `anon`. Isso resolve o sintoma e reabre a
tabela a quem não tem sessão — exatamente o que o #204 fechou.

## 3. A pergunta certa: com que papel chega o pedido?

O PostgREST resolve o pedido pelo JWT do cabeçalho `Authorization`. Sem JWT de
utilizador, o papel é `anon` — mesmo com a app a mostrar o utilizador na sessão.
Duas provas:

- **`src/services/pushGate.ts`** — `canPushToCloud()` decide pelo aparelho, pelo
  modo de base e pela blindagem. Não consulta a sessão do Supabase.
- **`src/components/Login.tsx`** — os caminhos de credencial local regressam
  **antes** de `signInWithPassword`:
  - autenticação pelo Dexie (`localAuthenticate`) — `return` com
    `markAppManagedSession()`;
  - «Barreira Local» (`isMasterLocal || matchedLocalUser`) — `return` com
    `markAppManagedSession()`;
  - biometria/desbloqueio reaproveitam o mesmo tipo de sessão.
  `markAppManagedSession()` (`src/utils/authUtils.ts`) grava a marca `APP` em
  `sessionStorage` e o comentário do próprio código diz o que isso significa:
  «não tem token do Supabase: a sessão é marcada como gerida pelo app».

Há ainda o *fail-safe* de arranque em `src/App.tsx` («perfil sem escopo na
nuvem, mas sessão local do app ativa — mantendo acesso»), que mantém o
utilizador dentro da app quando a nuvem não devolve sessão.

Em qualquer um destes estados a app está «autenticada» e **não há token**:
- o pull (`select` em `assets`) chega como `anon` → `42501` → a base só pode vir
  do aparelho (é a razão do ecrã de sincronização preso);
- o upsert da conferência chega como `anon` → `42501` → «Falha de envio».

Isto explica os três factos do relato: **depois de instalar/atualizar** (o
login caiu na credencial local), **com filial escolhida** (a lista de filiais
vem de dados locais/`unit_names`, que continua exposta), e **com o utilizador
autenticado no ecrã** — mas `anon` na nuvem.

## 4. Como confirmar

Na nuvem (SQL Editor), `assets` não deve ter `anon` (é o estado correto do
#204):

```sql
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'assets'
 order by grantee, privilege_type;
```

No aparelho, o sinal que distingue os dois casos é o **pull**: com sessão
válida a base desce da nuvem; sem sessão, o pull falha e a app fica só com a
base local. Se o envio falhar e a base só vier do aparelho, o pedido é `anon`.

A partir desta versão o próprio cartão diz qual dos casos é:

| Carimbo | Significado | Ação |
|---|---|---|
| `[42501] pedido chegou como anon (sem sessão) — entre de novo` | não há token do Supabase neste aparelho | sair e entrar com **e-mail e senha da nuvem** (não pela credencial local) |
| `[42501] sessão válida — falta o GRANT em assets` | há token; o papel `authenticated` não tem privilégio | corrigir os GRANTs na nuvem (nunca reabrir a `anon`) |
| `[42501] política de RLS recusou a linha` | há sessão; contrato/perfil não alcança a linha | corrigir `tenantid`/perfil, não os privilégios |

## 5. O que mudou no repositório

- **Revertido o #236** (o script de privilégios, o bloco de GRANTs do
  `docs/supabase_bootstrap.sql`, o teste `permissoesAssets` e a entrada de
  CHANGELOG). Nada volta a conceder `assets` a `anon`.
- **`src/utils/sessaoNuvem.ts`** — leitura pura do 42501: classifica a sessão
  pelo access token e constrói a mensagem certa para cada um dos três casos.
- **`estadoDaSessaoNuvem()`** em `src/services/supabaseService.ts` — pergunta ao
  cliente se há sessão (leitura local, tecto de 2 s, falha para
  `indeterminado`). A fila chama-a **uma vez por ciclo**, no primeiro 42501.

## 6. O que falta decidir (não implementado)

O envio continua a **tentar** com a sessão que houver; agora explica-se. Para
fechar o caso na origem há três caminhos, por ordem de custo:

1. **Portão de sessão no envio:** recusar o ciclo quando
   `estadoDaSessaoNuvem() !== 'autenticada'` e pedir novo login. Exige um aviso
   na UI e revisão dos testes que hoje enviam com o cliente stub.
2. **Base Oficial com login obrigatório na nuvem:** em modo `SUPABASE` e com
   rede, o login por credencial local deixa de valer — faz-se
   `signInWithPassword` e usa-se o perfil da nuvem; a credencial local fica só
   para o modo `INTERNAL`/offline.
3. **Sessão local com fila parada:** manter o trabalho offline e mostrar a fila
   como «à espera de sessão da nuvem», sem carimbar recusa por ativo.

Nenhum destes caminhos reabre a tabela a `anon`; todos mantêm o RLS do #204.
