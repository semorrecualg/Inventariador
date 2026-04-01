import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg-main flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-8 shadow-2xl border border-border relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-red-500" />
            
            <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mb-6 mx-auto">
              <AlertTriangle size={40} className="text-red-500" />
            </div>
            
            <h1 className="text-2xl font-black text-ink text-center uppercase tracking-tighter mb-4">
              Ops! Algo deu errado.
            </h1>
            
            <p className="text-ink-muted text-center text-sm mb-8 leading-relaxed">
              Ocorreu um erro inesperado na aplicação. Nossa equipe técnica já foi notificada (simulação).
            </p>

            <div className="bg-bg-main rounded-2xl p-4 mb-8 overflow-auto max-h-32 border border-border">
              <code className="text-[10px] font-mono text-red-600 break-all">
                {this.state.error?.message || 'Erro desconhecido'}
              </code>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full bg-accent hover:bg-accent-dark text-white font-black py-4 rounded-2xl shadow-lg shadow-accent/20 transition-all active:scale-95 flex items-center justify-center space-x-3 uppercase tracking-widest text-xs"
            >
              <RefreshCw size={18} />
              <span>Recarregar Aplicativo</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
