import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  CHAVE_RECARGA_BOOT,
  ehErroDeModulo,
  recarregarBootstrapUmaVez,
  removerLoaderDeArranque,
} from '../utils/bootArranque';

interface Props {
  children: ReactNode;
  /**
   * Recarregar sozinho quando o erro é «um módulo não chegou». Nos testes
   * desliga-se para não disparar navegação.
   */
  recarregarAutomatico?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  erroDeModulo: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    erroDeModulo: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, erroDeModulo: ehErroDeModulo(error) };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    // O loader do index.html é `position: fixed; z-index: 9999`: se o `App` não
    // monta, fica por cima deste cartão e o botão de recarregar nunca é
    // alcançável. Sai do caminho em qualquer erro.
    removerLoaderDeArranque();

    // «Failed to fetch dynamically imported module» não melhora sozinho sem um
    // novo pedido: recarrega uma vez (a guarda em sessionStorage evita o ciclo).
    if (this.state.erroDeModulo && this.props.recarregarAutomatico !== false) {
      recarregarBootstrapUmaVez();
    }
  }

  private tentarDeNovo = () => {
    // Recarga pedida pelo utilizador: não passa pela guarda, e limpa a marca
    // para que uma recuperação automática futura continue a ser possível.
    try {
      sessionStorage.removeItem(CHAVE_RECARGA_BOOT);
    } catch {
      /* sem sessionStorage: recarrega na mesma */
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const titulo = this.state.erroDeModulo
        ? 'A aplicação não carregou.'
        : 'Ops! Algo deu errado.';
      const descricao = this.state.erroDeModulo
        ? 'Um ficheiro do aplicativo não chegou (rede instável ou versão nova publicada). Recarregue para tentar de novo — os dados no aparelho não são afectados.'
        : 'Ocorreu um erro inesperado na aplicação. Nossa equipe técnica já foi notificada (simulação).';

      return (
        <div className="min-h-screen bg-bg-main flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-8 shadow-2xl border border-border relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-red-500" />

            <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mb-6 mx-auto">
              <AlertTriangle size={40} className="text-red-500" />
            </div>

            <h1 className="text-2xl font-black text-ink text-center uppercase tracking-tighter mb-4">
              {titulo}
            </h1>

            <p className="text-ink-muted text-center text-sm mb-8 leading-relaxed">
              {descricao}
            </p>

            <div className="bg-bg-main rounded-2xl p-4 mb-8 overflow-auto max-h-32 border border-border">
              <code className="text-[10px] font-mono text-red-600 break-all">
                {this.state.error?.message || 'Erro desconhecido'}
              </code>
            </div>

            <button
              onClick={this.tentarDeNovo}
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
