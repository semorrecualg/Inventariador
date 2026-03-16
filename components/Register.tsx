
import React, { useState } from 'react';
import { ChevronLeft, Loader2, AlertCircle } from 'lucide-react';
import { signUp } from '../services/supabaseService';
import { DatabaseMode } from '../types';

interface RegisterProps {
  onRegister: () => void;
  onGoToLogin: () => void;
  databaseMode: DatabaseMode;
}

// Ícone SVG Customizado para Ativo Imobilizado
const AssetIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
  >
    <path 
      d="M2 22H22" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
    />
    <path 
      d="M17 22V7L12 2L7 7V22" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinejoin="round" 
    />
    <path 
      d="M7 12H17" 
      stroke="currentColor" 
      strokeWidth="1.5" 
    />
    <path 
      d="M7 17H17" 
      stroke="currentColor" 
      strokeWidth="1.5" 
    />
    <rect 
      x="13" 
      y="13" 
      width="8" 
      height="6" 
      rx="1" 
      fill="white" 
      stroke="currentColor" 
      strokeWidth="1" 
    />
    <path 
      d="M15 15V17" 
      stroke="currentColor" 
      strokeWidth="1" 
    />
    <path 
      d="M17 15V17" 
      stroke="currentColor" 
      strokeWidth="1" 
    />
    <path 
      d="M19 15V17" 
      stroke="currentColor" 
      strokeWidth="1" 
    />
  </svg>
);

const Register: React.FC<RegisterProps> = ({ onRegister, onGoToLogin, databaseMode }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await signUp(email.trim(), password, username.toUpperCase());
      setIsSuccess(true);
      setTimeout(() => {
        onRegister();
      }, 5000);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Erro ao criar acesso.");
    } finally {
      setIsLoading(false);
    }
  };

  if (databaseMode === DatabaseMode.PROTHEUS_SUPABASE) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center animate-fadeIn bg-bg-main text-center">
        <div className="w-20 h-20 bg-accent-soft text-accent rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-accent/10">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-ink uppercase tracking-tight">Registro via Protheus</h2>
        <p className="text-ink-muted mt-4 text-xs font-medium leading-relaxed max-w-xs">
          Nesta modalidade, o registro de novos usuários deve ser realizado diretamente no sistema <span className="text-accent font-bold">Protheus</span>.
          <br/><br/>
          Utilize suas credenciais corporativas para entrar.
        </p>
        <button 
          onClick={onGoToLogin}
          className="mt-8 w-full max-w-xs bg-accent text-white font-bold py-5 rounded-3xl shadow-lg hover:opacity-90 transition-all uppercase tracking-[0.2em] text-sm"
        >
          Voltar ao Login
        </button>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center animate-fadeIn bg-bg-main text-center">
        <div className="w-20 h-20 bg-accent-soft text-accent rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-accent/10">
          <Loader2 size={32} className="animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-ink uppercase tracking-tight">Acesso Criado!</h2>
        <p className="text-ink-muted mt-4 text-xs font-medium leading-relaxed max-w-xs">
          Seu acesso foi registrado com sucesso. <br/><br/>
          <span className="text-amber-600 font-bold uppercase tracking-widest">Importante:</span> <br/>
          Verifique seu e-mail (<span className="text-ink font-bold">{email}</span>) para confirmar o cadastro. 
          Não esqueça de olhar a pasta de <span className="text-amber-600 font-bold">SPAM</span>.
        </p>
        <p className="mt-8 text-[10px] text-ink-muted uppercase tracking-widest animate-pulse">
          Redirecionando para o login...
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col justify-start animate-fadeIn bg-bg-main overflow-y-auto no-scrollbar pt-2">
      {/* Header compactado consistente com o Login */}
      <div className="mb-3 text-center">
        <div className="relative w-24 h-24 mx-auto mb-2">
          {/* Ícone SVG Customizado de Ativo Imobilizado */}
          <div className="absolute inset-0 bg-accent rounded-3xl shadow-xl transform -rotate-3 opacity-20"></div>
          <div className="absolute inset-0 bg-white rounded-3xl shadow-lg flex items-center justify-center transform rotate-3 transition-transform hover:rotate-0 overflow-hidden border border-accent-soft">
            <AssetIcon className="w-14 h-14 text-accent" />
          </div>
        </div>
        <h1 className="text-xl font-black text-ink tracking-tighter uppercase italic leading-none">
          GBR <span className="text-accent">AUDITORIA</span>
        </h1>
        <p className="text-ink-muted text-[8px] font-bold uppercase tracking-[0.2em] mt-1">
          INVENTÁRIO DE ATIVO IMOBILIZADO
        </p>
      </div>

      <div className="max-w-sm mx-auto w-full">
        <button onClick={onGoToLogin} className="mb-2 text-ink-muted flex items-center font-bold text-[7px] uppercase tracking-[0.2em] hover:text-accent transition-colors">
          <ChevronLeft size={12} className="mr-1" /> Voltar ao Login
        </button>
        
        {databaseMode === DatabaseMode.INTERNAL && (
          <div className="mb-2 p-2 bg-accent-soft border border-accent/10 rounded-xl">
            <p className="text-[7px] font-bold text-accent uppercase tracking-widest leading-relaxed">
              Atenção: Área exclusiva para Administradores. Auditores são cadastrados no painel interno.
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm mx-auto w-full">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-xl text-[9px] font-bold uppercase flex items-center mb-3 tracking-widest shadow-sm">
            <AlertCircle size={14} className="mr-2 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-1">Username</label>
          <input 
            type="text" 
            required
            value={username}
            onChange={(e) => setUsername(e.target.value.toUpperCase())}
            className="w-full px-4 py-3.5 rounded-2xl border border-accent/10 bg-white focus:border-accent outline-none transition-all text-ink font-bold uppercase shadow-sm text-sm"
            placeholder="EX: JOAO.SILVA"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-1">E-mail Corporativo</label>
          <input 
            type="email" 
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3.5 rounded-2xl border border-accent/10 bg-white focus:border-accent outline-none transition-all text-ink font-bold shadow-sm text-sm"
            placeholder="contato@gbr.com.br"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[9px] font-bold text-ink-muted uppercase tracking-[0.2em] ml-1">Senha</label>
          <input 
            type="password" 
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3.5 rounded-2xl border border-accent/10 bg-white focus:border-accent outline-none transition-all text-ink font-bold shadow-sm text-sm"
            placeholder="••••••••"
          />
        </div>
        <button 
          type="submit"
          disabled={isLoading}
          className="w-full bg-accent text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent/10 hover:opacity-90 active:scale-[0.98] transition-all mt-4 uppercase tracking-[0.2em] text-xs flex items-center justify-center space-x-2 disabled:opacity-70"
        >
          {isLoading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Criando Acesso...</span>
            </>
          ) : (
            <span>Criar Meu Acesso</span>
          )}
        </button>
      </form>
    </div>
  );
};

export default Register;
