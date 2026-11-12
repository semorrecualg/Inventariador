# Chave de assinatura do APK

`debug.keystore` é a chave com que **todos** os APKs de campo são assinados.

| Campo | Valor |
|---|---|
| Formato | PKCS#12 |
| Alias | `androiddebugkey` |
| Senha do keystore / da chave | `android` |
| Certificado (SHA-256) | `62:57:77:94:34:90:68:75:25:78:33:2F:ED:E8:F4:D2:70:63:80:68:DB:85:8F:B2:BC:CF:64:25:98:1D:75:16` |

## Porque é que ela está aqui

O Android identifica uma app pela chave de assinatura. Se a chave muda entre
builds, a instalação por cima da versão anterior é recusada com **“O app não foi
instalado”**. Antes a chave vinha de cache do runner (expira) ou era gerada no
próprio build — as duas coisas mudavam a assinatura sem ninguém pedir.

Guardar a chave no repositório é o que torna o build **repetível sem passos
manuais**.

## O que isto custa (e é preciso saber)

- Não é uma chave de produção: é uma chave de *debug*, com senha pública, usada
  para instalar por sideload. Não serve para publicar na Play Store.
- Quem tiver acesso de escrita a este repositório pode assinar um APK que o
  telemóvel aceita como atualização. Se isso for um risco para o teu caso,
  cadastra o secret `ANDROID_DEBUG_KEYSTORE_BASE64` (base64 deste ficheiro) no
  GitHub — o workflow passa a usá-lo e ignora o ficheiro do repositório.
- **Trocar esta chave obriga a desinstalar a app** nos aparelhos que já a têm
  (sincroniza antes: desinstalar apaga o banco local). Por isso ela não deve ser
  substituída à toa.

O workflow verifica, no fim de cada build, que o certificado do APK é este mesmo
SHA-256 — se não for, o build falha em vez de publicar um APK que ninguém vai
conseguir instalar por cima.
