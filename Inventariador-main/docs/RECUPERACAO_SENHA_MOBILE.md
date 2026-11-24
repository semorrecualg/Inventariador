# Recuperação de senha no APK — configuração completa

Documento operacional do fluxo «Esqueci a senha» quando a app corre no telemóvel.
Sem esta configuração o e-mail de recuperação abre um endereço que ninguém serve,
o token é consumido no `/verify` e **a senha nova nunca é gravada** — o login
responde `invalid_credentials` para sempre, mesmo com a conta correcta.

---

## 1. Porque o fluxo web não chega para o APK

No APK o origin da WebView é `https://localhost` (Capacitor, `androidScheme: https`).
Nenhum browser do telemóvel abre esse endereço, e o Supabase recusa `redirect_to`
que não esteja na lista de Redirect URLs — cai então no **Site URL**.

A correcção tem duas metades:

- **código** (já no repositório) — o app usa um deep link próprio e troca os
  tokens por sessão;
- **configuração** (Supabase + projecto Android) — descrita abaixo.

---

## 2. Supabase → Authentication → URL Configuration

| Campo | Valor | Porque |
|---|---|---|
| Site URL | `http://localhost:3000` | fallback para o fluxo web/dev; não pode ter esquema próprio |
| Redirect URL | `com.gbr.kardek://recovery` | deep link que o APK pede no `resetPassword` |
| Redirect URL | `http://localhost:3000/**` | app web em desenvolvimento |
| Redirect URL | `https://localhost` | origin real da WebView (não abre em browser, mas o Supabase exige-o para redes de desenvolvimento) |

Regras práticas:

- O Site URL **não** aceita wildcards e **não** deve ser um esquema custom
  (`app://…`): é usado como fallback e nos templates de e-mail.
- A entrada do deep link tem de ser **exacta** — `com.gbr.kardek://recovery`,
  sem `/**` e sem barra final.
- Quando existir um domínio público, o Site URL passa a ser esse endereço e
  acrescenta-se a Redirect URL correspondente. Sem domínio público, a
  recuperação por e-mail só funciona no APK ou em desenvolvimento local.

---

## 3. Projecto Android → intent-filter

A pasta `android/` é gerada (`npm run build` + `npx cap sync android`) e não está
versionada aqui, por isso este passo é feito no projecto gerado.

Em `AndroidManifest.xml`, dentro do bloco `<activity>` do `MainActivity`, acrescentar:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.gbr.kardek" android:host="recovery" />
</intent-filter>
```

O esquema deriva do `appId` em `capacitor.config.ts` (`com.gbr.kardek`). Se o
`appId` mudar, mudam três sítios: `capacitor.config.ts`, o intent-filter acima e
`ESQUEMA_RECUPERACAO` em `src/utils/recoveryLink.ts`.

Sem o intent-filter o Android não sabe quem deve abrir o link e entrega-o ao
browser, onde `com.gbr.kardek://` não existe.

---

## 4. O que o código faz

1. `resetPassword` (`src/services/supabaseService.ts`) envia
   `redirectTo = urlDeRecuperacao(Capacitor.isNativePlatform())`:
   no APK o esquema próprio, na web o origin actual.
2. O Supabase valida o `redirect_to` e o `/verify` devolve
   `com.gbr.kardek://recovery#access_token=…&refresh_token=…&type=recovery`.
3. O Android entrega o link à MainActivity; `src/App.tsx` escuta `appUrlOpen`
   **e** lê `getLaunchUrl()` — o evento só dispara com a app já viva, e o caso
   normal é a app estar fechada quando se toca no e-mail.
4. `tokensDoLinkDeRecuperacao` exige `type=recovery` e os dois tokens; o App
   troca-os por sessão com `setSession` e abre o ecrã «Definir Nova Senha», que
   grava com `auth.updateUser` e encerra a sessão temporária.

Um link de convite ou magic link (`type=magiclink`) não abre a troca de senha.
Na web, o `type=recovery` do URL é capturado no primeiro import de
`src/index.tsx` (`utils/passwordRecovery`), antes de o supabase-js limpar o hash,
e a marca em `sessionStorage` impede o boot de tratar a sessão como login.

---

## 5. Como testar

**Desenvolvimento (mais rápido, valida a configuração):**
com a app em `http://localhost:3000`, usar «Esqueci a senha», abrir o link no
mesmo browser e confirmar que aparece «Definir Nova Senha» e que a senha nova
entra no login.

**APK (o cenário real):**
regerar o APK depois do intent-filter, pedir a recuperação **de dentro do APK**
(é a plataforma que decide o `redirect_to`), abrir o link com a app fechada e
confirmar que a app abre no ecrã de nova senha.

**Preview do chat (`*.style.dev`):** o origin não está (nem deve estar) na lista,
portanto o Supabase cai no Site URL — a recuperação por e-mail **não** se testa
por aí.

---

## 6. Diagnóstico quando falha

- O ecrã de login mostra «Última recusa» com o código do Auth, o ref do projecto
  e o utilizador tentado.
- O log do SRE recebe uma linha `[Login] Entrada recusada …` com os mesmos
  campos, e `[Supabase] Recuperação de senha — destino do link:` mostra para
  onde o e-mail foi apontado.
- `POST /auth/v1/token?grant_type=password → 400` com `invalid_credentials`
  significa par e-mail+senha errado naquele projecto: não distingue conta
  inexistente de senha errada.
- Para separar app de servidor, chamar o endpoint directamente com a senha em
  causa; um `200` prova que a senha existe e que o problema é o link nunca ter
  gravado nada.
