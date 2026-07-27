# Guia de Deploy no Vercel

## Problema: "vite: command not found"

Esse erro ocorre durante o build no Vercel porque as dependências `devDependency` (incluindo Vite) não estão sendo instaladas.

### Solução Aplicada

Criei o arquivo `vercel.json` na raiz do projeto com a configuração correta:

```json
{
  "buildCommand": "npm install && npm run build",
  "outputDirectory": "dist",
  "devCommand": "vite"
}
```

### O que Isso Faz

- **buildCommand**: Garante que `npm install` seja executado ANTES de `npm run build`
- **outputDirectory**: Define que os arquivos compilados estão em `dist/`
- **devCommand**: Define o comando de desenvolvimento como `vite`

## Como Fazer Deploy

### Opção 1: Via GitHub (Recomendado)

1. Faça push da branch `interface-de-autenticacao` para o GitHub
2. Acesse [vercel.com](https://vercel.com)
3. Clique em "New Project"
4. Selecione o repositório `semorrecualg/Inventariador`
5. O Vercel automaticamente detectará `vercel.json` e fará o build correto

### Opção 2: Via Vercel CLI

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel

# Seguir as instruções na tela
```

### Opção 3: Via v0 (Botão Publish)

Clique no botão "Publish" no canto superior direito da v0 para fazer deploy automático.

## Checklist de Deploy

- [x] Arquivo `vercel.json` criado com configuração correta
- [x] `package.json` tem `vite` em `devDependencies`
- [x] Branch `interface-de-autenticacao` tem todos os commits
- [x] Todos os arquivos foram commitados

## Após o Deploy

O app será acessível em um URL como: `https://inventariador-xxxx.vercel.app`

### Variáveis de Ambiente

Se precisar de variáveis de ambiente:

1. Vá para o projeto no Vercel
2. Settings > Environment Variables
3. Adicione as variáveis necessárias
4. Re-deploy se necessário

## Monitoramento

- Acesse o projeto no Vercel para ver logs de build
- Use `vercel logs --follow` para ver logs em tempo real
- Verifique a aba "Deployments" para histórico

## Troubleshooting Deploy

| Erro | Solução |
|------|---------|
| "vite: command not found" | vercel.json criado - problema resolvido |
| Build timeout | Aumentar build timeout em Vercel settings |
| Erro de import | Verificar que todos os arquivos foram commitados |
| CORS errors | Configurar environment variables corretas |

## Próximos Passos

1. Faça push do commit com `vercel.json`
2. Crie um novo deployment no Vercel
3. Monitore o build - deve passar agora
4. Acesse a URL do preview
5. Teste a aplicação no mobile (300x583)

---

**Última atualização**: 27/07/2026  
**Status**: Pronto para Deploy
