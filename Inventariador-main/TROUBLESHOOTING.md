# 🔧 Guia de Resolução de Problemas - Failed to Load Preview

## ❌ Problema: "Failed to load preview"

### ✅ Solução (4 Passos)

#### **1. Verificar se o servidor está rodando**
```bash
# No terminal, na pasta do projeto:
cd /vercel/share/v0-project/Inventariador-main

# Verifique se há processos Vite/npm
ps aux | grep vite

# Se não há processo, inicie o servidor:
npm run dev
```

**Esperado**: Deve aparecer algo como:
```
  VITE v5.4.21  ready in 349 ms
  ➜  Local:   http://localhost:3000/
```

---

#### **2. Verificar Dependências**
```bash
# Se o servidor não iniciar com "npm run dev", reinstale:
npm install --legacy-peer-deps

# Depois tente novamente:
npm run dev
```

**Problema comum**: O erro `vite: command not found` significa que as dependências não estão instaladas.

---

#### **3. Limpar Cache e Reiniciar**
```bash
# Parar o servidor (Ctrl+C no terminal onde ele está rodando)
# Ou mate todos os processos:
pkill -f "vite"
pkill -f "npm run dev"

# Limpe o cache
rm -rf node_modules/.vite

# Inicie novamente
npm run dev
```

---

#### **4. Verificar Porta**
```bash
# O projeto usa por padrão a porta 3000
# Verifique se está livre:
lsof -i :3000

# Se há outro processo usando 3000:
kill -9 <PID>

# Ou altere a porta no vite.config.ts:
# Procure por "port: 3000" e mude para "port: 3001"
```

---

## 🎯 Checklist Rápido

| Item | Status | Ação |
|------|--------|------|
| Servidor rodando? | ✓ ou ✗ | Se ✗, execute `npm run dev` |
| Dependências instaladas? | ✓ ou ✗ | Se ✗, execute `npm install --legacy-peer-deps` |
| Porta 3000 livre? | ✓ ou ✗ | Se ✗, mate o processo ou mude a porta |
| Browser atualizado? | ✓ ou ✗ | Se ✗, recarregue com F5 ou Ctrl+R |
| Sem erros no console? | ✓ ou ✗ | Abra DevTools (F12) e verifique |

---

## 🚨 Erros Específicos e Soluções

### **Erro: "vite: command not found"**
```bash
npm install --legacy-peer-deps
npm run dev
```

### **Erro: "EADDRINUSE: address already in use :::3000"**
```bash
# Matar processo na porta 3000
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Ou inicie em outra porta editando vite.config.ts
```

### **Erro: "Failed to load preview" / "Blank page"**
```bash
# 1. Recarregue o navegador (F5)
# 2. Limpe cache do navegador (DevTools -> Application -> Clear Storage)
# 3. Reinicie o servidor
pkill -f vite && sleep 2 && npm run dev
```

### **Erro: "Module not found" ou "Cannot find module"**
```bash
# Reinstale dependências
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run dev
```

---

## 📊 Verificações Técnicas

### **Verificar se o Vite está listening**
```bash
netstat -tlnp | grep 3000
# ou
ss -tlnp | grep 3000
```

Deve aparecer algo como:
```
LISTEN    0    4096  0.0.0.0:3000    0.0.0.0:*
```

### **Ver logs do servidor**
```bash
# Se iniciou em background, veja os logs:
tail -100 /tmp/vite-server.log

# Se há arquivo de erro:
cat /tmp/vite-error.log
```

### **Testar conexão**
```bash
# Teste se o servidor responde
curl -v http://localhost:3000

# Deve retornar HTML
```

---

## 🎓 Passos Completos para Reset Total

Se nada acima funcionar, faça um reset completo:

```bash
# 1. Ir para o diretório
cd /vercel/share/v0-project/Inventariador-main

# 2. Matar todos os processos relacionados
pkill -9 -f vite
pkill -9 -f "npm run dev"
pkill -9 -f node

# 3. Limpar tudo
rm -rf node_modules package-lock.json
rm -rf .vite

# 4. Reinstalar
npm install --legacy-peer-deps

# 5. Iniciar fresh
npm run dev

# 6. Aguarde ~5 segundos e teste:
curl http://localhost:3000
```

---

## 🆘 Ainda Não Funcionou?

1. **Verifique a porta correta** - O projeto usa porta **3000** por padrão
2. **Verifique se tem espaço em disco** - `df -h`
3. **Verifique permissões** - Pode iniciar `npm install` sem sudo?
4. **Versão do Node** - Deve ser v18+ (`node --version`)
5. **Abra DevTools** - F12 no navegador para ver erros específicos

---

## 💡 Dicas Úteis

- **Hot Reload** funciona: Se editar um arquivo .tsx ou .css, a página recarrega automaticamente
- **Ctrl+Shift+R** força recarregar sem cache no navegador
- **npm run dev** vs **npx vite** - Ambos funcionam, a primeira é mais comum
- Se o servidor crashar, ele **reinicia automaticamente** ao editar um arquivo

---

## 📞 Suporte Rápido

| Problema | Solução em 1 linha |
|----------|---|
| Página em branco | `pkill -f vite && sleep 2 && npm run dev` |
| Porta ocupada | `lsof -i :3000` ou edite vite.config.ts |
| Sem acesso | Verifique firewall/antivírus |
| Lento | Feche abas do navegador, reinicie terminal |
| Não atualiza | Limpe cache: DevTools → Application → Clear All |

---

**Última atualização**: 2024-07-27  
**Versão do Vite**: 5.4.21  
**Versão do Node requerida**: 18.0.0+
