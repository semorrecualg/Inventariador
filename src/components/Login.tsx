import { Eye, EyeOff, Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { authenticateBiometric, hasBiometricRegistered, isBiometricSupported } from '../services/biometricService';
import { localDb } from '../services/localDbService';
import { ensureUserProfile, getEmailByUsername, logAuditEvent, supabase } from '../services/supabaseService';
import { safeStringify } from '../services/utils';
import { DatabaseMode, User, UserRole } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
  users: User[];
  databaseMode: DatabaseMode;
  // Props de UI/integração removidos: não utilizados na versão atual
}

const Login: React.FC<LoginProps> = ({
  onLogin,
  users,
  databaseMode
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasBio, setHasBio] = useState(false);

  React.useEffect(() => {
    const checkBio = async () => {
      if (username.length > 3) {
        const supported = await isBiometricSupported();
        if (supported) {
          const registered = await hasBiometricRegistered(username.trim().toLowerCase());
          setHasBio(registered);
        } else {
          setHasBio(false);
        }
      } else {
        setHasBio(false);
      }
    };
    checkBio();
  }, [username]);

  const validateEmailGovernance = (emailStr: string): boolean => {
    const sanitized = emailStr.trim().toLowerCase();
    if (sanitized.endsWith('.com.br')) {
      console.error('>>> [Governança] sufixo .com.br proibido.');
      return false;
    }
    return true;
  };

  const handleBiometricLogin = async () => {
    if (!username) return;
    try {
      setIsLoading(true);
      const success = await authenticateBiometric(username.trim().toLowerCase());
      if (success) {
        const localUser = users.find(u =>
          u.email.toLowerCase() === username.trim().toLowerCase() ||
          u.username.toLowerCase() === username.trim().toLowerCase()
        );
        if (localUser) {
          sessionStorage.setItem('app_current_user', safeStringify(localUser));
          logAuditEvent({ user_email: localUser.email, action: 'LOGIN', details: 'Biometria (Local)', tenantId: localUser.tenantId });
          onLogin(localUser);
        } else {
          setError('Usuário biométrico não encontrado.');
        }
      }
    } catch {
      setError('Falha na autenticação biométrica.');
    } finally {
      setIsLoading(false);
    }
  };

  const attemptLocalLogin = async (normalizedUsername: string): Promise<User | null> => {
    let matchedLocalUser = users.find(u => (u.email.toLowerCase() === normalizedUsername || u.username.toLowerCase() === normalizedUsername) && u.password === password);
    if (!matchedLocalUser) {
      try {
        const dbUsers = await localDb.users.toArray();
        matchedLocalUser = dbUsers.find(u => (u.email.toLowerCase() === normalizedUsername || u.username.toLowerCase() === normalizedUsername) && u.password === password);
      } catch (err) {
        console.warn('[Login] SQLite inacessível', err);
      }
    }
    return matchedLocalUser ?? null;
  };

  const attemptSupabaseLogin = async (normalizedUsername: string): Promise<User | null> => {
    if (!navigator.onLine || databaseMode !== DatabaseMode.SUPABASE || !supabase) return null;

    let loginEmail = normalizedUsername;
    if (!loginEmail.includes('@')) {
      const foundEmail = await getEmailByUsername(username.trim());
      if (!foundEmail) throw new Error('Username não encontrado na nuvem.');
      loginEmail = foundEmail;
    }

    const authResult = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    if (authResult.error) throw authResult.error;
    if (!authResult.data.user) throw new Error('Falha ao recuperar dados do usuário.');

    const cloudUser = await ensureUserProfile(authResult.data.user.id, authResult.data.user.email ?? '', authResult.data.user.user_metadata);
    const finalUsername = cloudUser.username || authResult.data.user.email!.split('@')[0];
    const isMasterCloud = cloudUser.email.toLowerCase() === 'semorr@gmail.com';

    return {
      id: authResult.data.user.id,
      username: finalUsername,
      name: cloudUser.name || finalUsername,
      email: cloudUser.email,
      role: cloudUser.role as UserRole,
      is_admin: cloudUser.role === 'ADMIN' || isMasterCloud,
      isAdmin: cloudUser.role === 'ADMIN' || isMasterCloud,
      mustChangePassword: false,
      tenantId: isMasterCloud ? 'CICOPAL' : cloudUser.tenantId || '',
      filial: isMasterCloud ? 'MATRIZ' : cloudUser.filial || ''
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const loginTimeout = setTimeout(() => {
      setIsLoading(false);
      setError('A autenticação está demorando muito.');
    }, 45000);

    try {
      const normalizedUsername = username.trim().toLowerCase();
      if (!validateEmailGovernance(normalizedUsername)) {
        setError('Erro de Governança: .com.br proibido.');
        return;
      }

      const localUser = await attemptLocalLogin(normalizedUsername);
      if (localUser) {
        sessionStorage.setItem('app_current_user', safeStringify(localUser));
        logAuditEvent({ user_email: localUser.email, action: 'LOGIN', details: 'Local', tenantId: localUser.tenantId });
        onLogin(localUser);
        return;
      }

      const cloudUser = await attemptSupabaseLogin(normalizedUsername);
      if (cloudUser) {
        sessionStorage.setItem('app_current_user', safeStringify(cloudUser));
        logAuditEvent({ user_email: cloudUser.email, action: 'LOGIN', details: 'Supabase', tenantId: cloudUser.tenantId });
        onLogin(cloudUser);
        return;
      }

      setError('Dispositivo offline e credenciais não encontradas no SQLite.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao autenticar.');
    } finally {
      clearTimeout(loginTimeout);
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Acessar Inventariador</h2>
      {error && <div className="mb-3 text-red-600">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium">Usuário ou e-mail</label>
          <input id="username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">Senha</label>
          <div className="relative">
            <input id="password" type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-2">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded" disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" /> : 'Acessar Sistema'}
          </button>
          {hasBio && <button type="button" onClick={handleBiometricLogin} className="ml-2 text-sm">Entrar com Biometria</button>}
        </div>
      </form>
    </div>
  );
};

export default Login;
