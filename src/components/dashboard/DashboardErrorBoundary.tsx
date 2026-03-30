import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class DashboardErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Auto-recover from DOM reconciliation errors (caused by preview overlay scripts)
    if (error.message?.includes('removeChild') || error.message?.includes('insertBefore')) {
      setTimeout(() => this.setState({ hasError: false }), 100);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#8a99ad', fontFamily: 'monospace' }}>Refreshing...</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
