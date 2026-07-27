# 🔧 Exemplo Completo de Integração - LoginFlow

Este arquivo mostra como integrar o novo sistema de login ao seu `App.tsx`.

## Versão Atual do App.tsx

```tsx
import { LoginFlow } from './components/LoginFlow';
import { AppScreen, DatabaseMode, User } from './types';

// ... outros imports

const App: React.FC = () => {
  // ... estado existente

  // Render
  return (
    <ErrorBoundary>
      <Routes>
        {/* LOGIN SCREEN - AGORA COM LOGINFLOW */}
        {appScreen === AppScreen.LOGIN && (
          <LoginFlow
            onLogin={handleLogin}
            users={users}
            databaseMode={databaseMode}
            onOpenPrivacyCenter={() => setIsPrivacyCenterOpen(true)}
            onUpdateScreen={setAppScreen}
            onShowModal={setModalConfig}
            onUpdateDatabaseMode={setDatabaseMode}
            onDemoMode={handleDemoMode}
            onHandleSubmit={handleAuthSubmit}
            onBiometricLogin={handleBiometricLogin}
          />
        )}

        {/* ... resto das rotas */}
      </Routes>
    </ErrorBoundary>
  );
};
```

## Funções de Callback Necessárias

### 1. handleLogin

```tsx
const handleLogin = (user: User) => {
  logger.info('[App] Usuário logado:', user.email);
  
  // Salvar na sessão
  sessionStorage.setItem('app_current_user', JSON.stringify(user));
  
  // Atualizar estado do app
  setUser(user);
  
  // Navegar para próxima tela
  setAppScreen(AppScreen.UNIT_SELECTION);
};
```

### 2. handleAuthSubmit

```tsx
const handleAuthSubmit = async (email: string, password: string) => {
  logger.info('[App] Tentando autenticar:', email);
  
  try {
    // Opção 1: Modo Local (SQLite)
    if (databaseMode === DatabaseMode.INTERNAL) {
      const localUser = users.find(u => 
        (u.email.toLowerCase() === email.toLowerCase() ||
         u.username.toLowerCase() === email.toLowerCase()) &&
        u.password === password
      );
      
      if (!localUser) {
        throw new Error('Email ou senha incorretos.');
      }
      
      handleLogin(localUser);
      return;
    }

    // Opção 2: Modo Cloud (Supabase)
    if (databaseMode === DatabaseMode.SUPABASE_PLUS) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: password
      });
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (!data.user) {
        throw new Error('Falha ao autenticar. Tente novamente.');
      }
      
      // Buscar perfil do usuário
      const profile = await ensureUserProfile(data.user.id);
      
      const cloudUser: User = {
        id: data.user.id,
        email: data.user.email || '',
        username: data.user.user_metadata?.username || 'Usuário',
        name: data.user.user_metadata?.name || 'Usuário',
        role: profile?.role || 'AUDITOR',
        is_admin: profile?.is_admin || false,
        isAdmin: profile?.is_admin || false,
        tenantId: profile?.tenant_id || 'DEFAULT'
      };
      
      handleLogin(cloudUser);
      
      // Log de auditoria
      await logAuditEvent({
        user_email: cloudUser.email,
        action: 'LOGIN',
        details: 'Login via nuvem com sucesso',
        tenantId: cloudUser.tenantId
      });
      
      return;
    }

    throw new Error('Modo de banco de dados inválido.');

  } catch (err: any) {
    logger.error('[App] Erro na autenticação:', err);
    throw err;
  }
};
```

### 3. handleBiometricLogin

```tsx
const handleBiometricLogin = async (email: string): Promise<boolean> => {
  logger.info('[App] Tentando login biométrico para:', email);
  
  try {
    // Verificar se o usuário local existe
    const localUser = users.find(u => 
      u.email.toLowerCase() === email.toLowerCase() ||
      u.username.toLowerCase() === email.toLowerCase()
    );
    
    if (!localUser) {
      logger.warn('[App] Usuário biométrico não encontrado');
      return false;
    }

    // Autenticar com biometria
    const success = await authenticateBiometric(email.toLowerCase());
    
    if (success) {
      handleLogin(localUser);
      
      // Log de auditoria
      await logAuditEvent({
        user_email: localUser.email,
        action: 'LOGIN',
        details: 'Login via biometria com sucesso',
        tenantId: localUser.tenantId || 'LOCAL'
      });
      
      return true;
    }

    logger.warn('[App] Autenticação biométrica falhou');
    return false;

  } catch (err) {
    logger.error('[App] Erro na biometria:', err);
    return false;
  }
};
```

### 4. handleDemoMode

```tsx
const handleDemoMode = async () => {
  logger.info('[App] Iniciando modo demo');
  
  try {
    // Usar serviço de demo
    const success = await demoService.initDemoSession();
    
    if (!success) {
      throw new Error('Falha ao inicializar dados de demonstração');
    }

    // Carregar usuário demo
    const demoUser = demoService.getDemoUser();
    
    // Definir modo
    setDatabaseMode(DatabaseMode.INTERNAL);
    
    // Login
    handleLogin(demoUser);

  } catch (err: any) {
    logger.error('[App] Erro ao inicializar demo:', err);
    setModalConfig({
      title: 'Erro no Modo Demo',
      message: err.message || 'Não foi possível inicializar o modo de demonstração.',
      type: 'alert'
    });
  }
};
```

## Fluxo Completo de Integração

```
┌─────────────────────────────────┐
│      Aplicação Inicia            │
└────────────┬────────────────────┘
             │
             ▼
      ┌─────────────────┐
      │  App.tsx Load   │
      │  Estado inicial │
      └────────┬────────┘
               │
               ▼
    ┌──────────────────────┐
    │  appScreen === LOGIN │
    │  Renderiza LoginFlow │
    └────────┬─────────────┘
             │
      ┌──────────────────────┐
      │  LoginFlow Internal  │
      │  - Gerencia passos   │
      │  - Valida entrada    │
      │  - Chama callbacks   │
      └──────┬───────────────┘
             │
    ┌────────┴──────────┐
    │                   │
    ▼                   ▼
┌────────────┐   ┌──────────────┐
│  onLogin   │   │ onDemoMode   │
│ handleAuth │   │ initDemo     │
└────┬───────┘   └──────┬───────┘
     │                  │
     │            ┌─────▼─────┐
     │            │  Demo OK  │
     │            └─────┬─────┘
     │                  │
     └──────────┬───────┘
                ▼
        ┌─────────────────┐
        │   handleLogin   │
        │ - Save session  │
        │ - Update state  │
        │ - Log audit     │
        └────────┬────────┘
                 ▼
        ┌─────────────────┐
        │ setAppScreen()  │
        │ UNIT_SELECTION  │
        └────────┬────────┘
                 ▼
        ┌─────────────────┐
        │  Próxima Tela   │
        │   Renderiza     │
        └─────────────────┘
```

## Alternativas de Implementação

### Opção A: Usar o LoginFlow Diretamente (Recomendado)

```tsx
// No seu App.tsx
import { LoginFlow } from './components/LoginFlow';

// ... na seção de render
{appScreen === AppScreen.LOGIN && (
  <LoginFlow {...allProps} />
)}
```

**Vantagens:**
- ✅ Componente pronto para usar
- ✅ Todas animações incluídas
- ✅ Validações integradas
- ✅ Melhor UX/UI

### Opção B: Manter o Login Antigo com Redesign

```tsx
// Se quiser manter o componente Login.tsx original
// mas melhorar apenas a aparência

import Login from './components/Login';
import './styles/login-new-theme.css';

{appScreen === AppScreen.LOGIN && (
  <Login
    {...loginProps}
    className="login-modern"
  />
)}
```

### Opção C: Wrapper Customizado

```tsx
// Se precisa de lógica customizada

const CustomLoginFlow: React.FC<LoginFlowProps> = (props) => {
  const [step, setStep] = useState('welcome');
  
  return (
    <div className="custom-wrapper">
      <LoginFlow
        {...props}
        onLogin={(user) => {
          // Lógica adicional aqui
          console.log('Custom logic before login');
          props.onLogin(user);
        }}
      />
    </div>
  );
};
```

## Testing

### Teste Manual - Fluxo Happy Path

```
1. Abrir app
2. Clicar "Continuar"
3. Digitar email válido
4. Clicar "Próximo"
5. Digitar senha
6. Clicar "Acessar"
7. Verificar se navegou para UNIT_SELECTION
8. Verificar se sessão foi salva
```

### Teste Biometria

```
1. Configurar biometria no dispositivo
2. Registrar fingerprint no app
3. Fazer login com biometria
4. Verificar se entrou sem pedir senha
```

### Teste Error Handling

```
1. Tentar login com email inválido
2. Tentar login com senha errada
3. Tentar login sem internet (demo)
4. Verificar mensagens de erro claras
```

## Troubleshooting

### Problema: Botões não respondem ao clique

**Solução:**
```tsx
// Verifique se o callback está implementado
// Adicione console.log para debug

const handleAuthSubmit = async (email: string, password: string) => {
  console.log('[DEBUG] Auth submit chamado com:', email);
  try {
    // ... lógica
  } catch (err) {
    console.error('[ERROR]', err);
    throw err;
  }
};
```

### Problema: Validação não funciona

**Solução:**
```tsx
// Verifique a lógica de validação
// Lembrando que LoginFlow valida automaticamente

const validateEmail = (email: string): boolean => {
  const isEmail = email.includes('@');
  const isUsername = email.length >= 3;
  return isEmail || isUsername;
};
```

### Problema: Animações travadas

**Solução:**
```tsx
// Verifique se motion/react está instalado
npm install motion react@latest

// Ou force rebuild
npm run build
```

## Performance Tips

1. **Lazy Load:** LoginFlow já usa lazy loading
2. **Cache:** Armazene dados de usuário em sessionStorage
3. **Debounce:** Valide email com debounce
4. **Compression:** CSS/JS minificados em produção

## Próximos Passos

- [ ] Customizar cores conforme brand
- [ ] Adicionar suporte multi-idioma
- [ ] Implementar "Esqueci senha"
- [ ] Adicionar 2FA (Two Factor Auth)
- [ ] Analytics de conversão
- [ ] A/B testing de UX

---

**Data**: 27/07/2026
**Versão**: 2.6.0
**Status**: ✅ Pronto para produção
