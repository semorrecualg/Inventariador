# Guia do APK — pedir e instalar no telemóvel

> Este guia é para quem **usa** o app, não para quem programa. Não precisa de
> instalar nada no computador, nem de usar terminal.
>
> O APK é o ficheiro que instala o GBR KARDEK no telemóvel Android. Ele é gerado
> automaticamente pelo GitHub sempre que alguém o pede.

---

## 1. Pedir o APK

Escolha **uma** das duas formas. A primeira é a mais simples.

### Forma A — pedir por comentário (recomendada)

1. Abra o **pull request** (a página onde as alterações estão a ser revistas).
2. No fim da conversa, escreva num comentário, sozinho na primeira linha:

   ```
   /apk
   ```

3. Envie. Em poucos segundos aparece um comentário automático a dizer que o
   build começou.
4. Espere de **5 a 10 minutos**. Quando terminar, o mesmo lugar recebe um
   comentário novo: **“APK gerado ✅”**, com o nome do ficheiro e o link.

Se o comentário automático disser que não tem permissão, é porque a sua conta
não tem acesso de escrita ao projeto — peça a quem administra.

### Forma B — pedir pela lista de Actions

1. Abra o repositório no GitHub e clique em **Actions** (barra do topo).
2. Na lista da esquerda, escolha **“Build Android APK (versão lida do
   package.json)”**.
3. Clique no botão **Run workflow** (à direita), escolha a branch e confirme.
4. Espere o “✅” verde ao lado do run.

---

## 2. Baixar o APK

O ficheiro fica guardado no run, na secção **Artifacts**. Ele expira em
**7 dias**, então baixe no mesmo dia.

1. Abra o run (pelo link do comentário, ou em **Actions → o run mais recente**).
2. Desça até ao fim da página: **Artifacts → `gbr-kardek-apk`**.
3. O GitHub entrega um ficheiro **.zip**. Dentro dele está o APK, com nome
   parecido com `gbr-kardek-v2.7.4-20261112.apk`, e um ficheiro `.sha256`.

Também vale baixar direto no telemóvel (o GitHub pede login). Se preferir, baixe
no computador e envie o APK para o telemóvel por WhatsApp, e-mail ou cabo.

---

## 3. Instalar no telemóvel

1. Toque no ficheiro `.apk` (se veio num `.zip`, extraia primeiro).
2. O Android avisa que a app não é da Play Store. Toque em **Configurações** e
   ligue **“Permitir desta fonte”** para o app de onde abriu o ficheiro
   (Arquivos, Chrome, WhatsApp…).
3. Volte e toque em **Instalar**.
4. Abra o **GBR KARDEK**. Na primeira vez, entre com a sua conta.

> **Se o telemóvel recusar com “App não instalado”**, veja o ponto 4.

---

## 4. A primeira instalação desta versão pede uma limpeza

Foi trocada a **chave de assinatura** do app (o que identifica a app para o
Android). Por isso, **nesta primeira vez** o telemóvel não aceita instalar por
cima da versão antiga.

Antes de desinstalar, faça isto:

1. Abra o app antigo e **sincronize** (garanta que não há nada “pendente”).
2. Desinstale o app antigo.
3. Instale o APK novo.

**Atenção:** desinstalar apaga os dados guardados no telemóvel. Só faça depois de
sincronizar. Das próximas versões em diante, instala por cima normalmente — isto
não se repete.

---

## 5. Se algo der errado

| O que aparece | O que significa | O que fazer |
|---|---|---|
| “App não instalado” | assinatura diferente da versão que está no telemóvel | desinstalar a antiga (ponto 4) e instalar de novo |
| “Fonte desconhecida bloqueada” | o Android não permite instalar fora da Play Store | ligar “Permitir desta fonte” nas configurações |
| O comentário `/apk` não gerou nada | quem comentou não tem permissão de escrita | pedir a um administrador do projeto |
| O build ficou vermelho (❌) | alguma verificação falhou | abrir o run e ler a última linha vermelha; o motivo está escrito em português |
| O app abre mas diz “MOBILE (LOCAL)” ou pede base offline | o APK saiu sem as credenciais da nuvem | avisar quem cuida do projeto: o build devia ter falhado, não entregado esse APK |
| O link do artefacto já não funciona | artefactos expiram em 7 dias | pedir o APK outra vez |

---

## 6. O que este APK é (e não é)

- É um **APK de teste** (debug): instala e funciona em qualquer Android, mas
  **não serve para publicar na Play Store**.
- Ele **não se atualiza sozinho**: para ter uma versão nova, é preciso pedir e
  instalar de novo.
- O artefacto do GitHub expira em **7 dias**. Para uma versão que precise ficar
  guardada, peça uma **release** (tag `v…`): aí o APK fica anexado para sempre.
- Sempre que quiser conferir se o APK é o certo, o resumo do run mostra o
  **SHA-256 do APK** e o **certificado** usado na assinatura.

---

## 7. Resumo em uma linha

> Pedir: comentar `/apk` no pull request. Baixar: Artifacts → `gbr-kardek-apk`.
> Instalar: tocar no ficheiro e permitir a fonte. Na primeira vez desta versão,
> sincronizar → desinstalar → instalar.
