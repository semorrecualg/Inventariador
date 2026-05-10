import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
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
        <div style={{ 
          minHeight: '100vh', 
          backgroundColor: '#0f172a', 
          color: 'white', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'sans-serif'
        }}>
          <div style={{
            maxWidth: '400px',
            width: '100%',
            backgroundColor: '#1e293b',
            padding: '2rem',
            borderRadius: '1.5rem',
            textAlign: 'center',
            border: '1px solid #334155'
          }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '1rem' }}>Falha de Sistema</h2>
            <div style={{ backgroundColor: '#020617', padding: '1rem', borderRadius: '1rem', marginBottom: '1rem', textAlign: 'left' }}>
              <code style={{ fontSize: '12px', color: '#fb7185' }}>{this.state.error?.message || 'Erro Desconhecido'}</code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              style={{
                width: '100%',
                padding: '1rem',
                backgroundColor: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Recarregar Kardek
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
