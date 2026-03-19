import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', gap: 16, padding: 24,
          fontFamily: 'system-ui, sans-serif', color: '#e2e8f0', background: '#0f172a',
        }}>
          <h2 style={{ margin: 0 }}>出了点问题 / Something went wrong</h2>
          <p style={{ margin: 0, color: '#94a3b8', maxWidth: 480, textAlign: 'center' }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 24px', borderRadius: 8, border: 'none',
              background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 14,
            }}
          >
            重试 / Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
