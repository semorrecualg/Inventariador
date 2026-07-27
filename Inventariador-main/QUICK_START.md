# ⚡ Quick Start - Novo Sistema de Login

**Tempo estimado**: 5 minutos

---

## 1️⃣ Importar o Componente

```tsx
// No seu App.tsx ou arquivo principal
import { LoginFlow } from './components/LoginFlow';
```

---

## 2️⃣ Adicionar ao Render

```tsx
// Dentro do seu componente App
{appScreen === AppScreen.LOGIN && (
  <LoginFlow
    onLogin={handleLogin}
    users={users}
    databaseMode={databaseMode}
    onOpenPrivacyCenter={handlePrivacy}
    onUpdateScreen={setScreen}
    onShowModal={setModal}
    onUpdateDatabaseMode={setMode}
    onDemoMode={handleDemo}
    onHandleSubmit={handleAuth}
    onBiometricLogin={handleBio}
  />
)}
```

---

## 3️⃣ Implementar Callbacks

### a) handleLogin

```tsx
const handleLogin = (user: User) => {
  sessionStorage.setItem('app_current_user', JSON.stringify(user));
  setAppScreen(AppScreen.UNIT_SELECTION);
};
```

### b) handleAuthSubmit

```tsx
const handleAuthSubmit = async (email: string, password: string) => {
  // Seu código de autenticação aqui
  const user = await authenticateUser(email, password);
  if (!user) throw new Error('Credenciais inválidas');
  return user;
};
```

### c) handleBiometricLogin

```tsx
const handleBiometricLogin = async (email: string): Promise<boolean> => {
  try {
    return await authenticateBiometric(email);
  } catch (err) {
    return false;
  }
};
```

---

## 4️⃣ Testar

```bash
# Iniciar dev server
npm run dev

# Abrir em http://localhost:5173
# Clicar em "Continuar"
# Inserir email
# Inserir senha
# Pronto! ✅
```

---

## 📱 Resultado

Você terá as seguintes telas:

```
1. Boas-vindas (LoginWelcome)
   ↓
2. Email (LoginEmail)
   ↓
3. Senha (LoginPassword)
   ↓
✅ Autenticado
```

---

## 🎨 Customizar Cores

Edite `src/index.css`:

```css
@theme {
  --color-accent: #2563EB; /* Mude para sua cor */
  --color-success: #10B981;
  --color-danger: #EF4444;
}
```

---

## 🔐 Adicionar Biometria

```tsx
// Verifique se biometria está disponível
import { isBiometricSupported } from './services/biometricService';

const isSupported = await isBiometricSupported();
// Se true, o botão de biometria aparecerá automaticamente
```

---

## 📋 Checklist

- [ ] Importou LoginFlow
- [ ] Adicionou ao render
- [ ] Implementou handleLogin
- [ ] Implementou handleAuthSubmit
- [ ] Implementou handleBiometricLogin
- [ ] Testou no navegador
- [ ] Testou em mobile
- [ ] Verificou validações
- [ ] Verificou animações
- [ ] Pronto para produção ✅

---

## 🐛 Se Algo Não Funcionar

### Componente não aparece?
```bash
npm run dev
# Verifique console para erros
```

### Botões não funcionam?
```tsx
// Adicione console.log nos callbacks
const handleAuth = async (email: string, password: string) => {
  console.log('[DEBUG]', email, password);
  // ... seu código
};
```

### Estilo quebrado?
```bash
# Limpe cache
rm -rf node_modules/.vite
npm run dev
```

---

## 📚 Mais Informações

- **Componentes**: `COMPONENT_USAGE.md`
- **Integração**: `INTEGRATION_EXAMPLE.md`
- **Design**: `SCREENS_VISUAL_GUIDE.md`
- **Resumo**: `LOGIN_IMPLEMENTATION_SUMMARY.md`

---

## ✨ Pronto!

Seu novo sistema de login está rodando! 🎉

---

**Próximos Passos:**
1. Customize as cores para seu brand
2. Teste com dados reais
3. Teste em múltiplos dispositivos
4. Deploy para produção

**Sucesso!** 🚀
