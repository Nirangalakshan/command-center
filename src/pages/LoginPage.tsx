import '@/styles/dashboard.css';
import { useState, type FormEvent } from 'react';

interface LoginPageProps {
  onSignIn: (email: string, password: string) => Promise<{ error: string | null }>;
}

export default function LoginPage({ onSignIn }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await onSignIn(email, password);
    if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="cc-root" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        padding: 32,
        background: 'var(--cc-bg-panel)',
        border: '1px solid var(--cc-border-default)',
        borderRadius: 'var(--cc-radius-lg)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="cc-header-logo" style={{ width: 48, height: 48, fontSize: 22, margin: '0 auto 12px' }}>📡</div>
          <div className="cc-header-title" style={{ fontSize: 18 }}>COMMAND CENTRE</div>
          <div className="cc-header-subtitle" style={{ marginTop: 4 }}>SIGN IN TO CONTINUE</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--cc-font-mono)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: 'var(--cc-text-muted)',
              marginBottom: 6,
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--cc-bg-elevated)',
                border: '1px solid var(--cc-border-default)',
                borderRadius: 'var(--cc-radius-sm)',
                color: 'var(--cc-text-primary)',
                fontFamily: 'var(--cc-font-mono)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--cc-font-mono)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: 'var(--cc-text-muted)',
              marginBottom: 6,
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--cc-bg-elevated)',
                border: '1px solid var(--cc-border-default)',
                borderRadius: 'var(--cc-radius-sm)',
                color: 'var(--cc-text-primary)',
                fontFamily: 'var(--cc-font-mono)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '8px 12px',
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: 'var(--cc-radius-sm)',
              color: 'var(--cc-color-red)',
              fontFamily: 'var(--cc-font-mono)',
              fontSize: 11,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '11px 0',
              background: loading ? 'var(--cc-bg-elevated)' : 'var(--cc-color-cyan)',
              border: 'none',
              borderRadius: 'var(--cc-radius-sm)',
              color: loading ? 'var(--cc-text-muted)' : '#060a10',
              fontFamily: 'var(--cc-font-mono)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 4,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{
          marginTop: 20,
          textAlign: 'center',
          fontFamily: 'var(--cc-font-mono)',
          fontSize: 10,
          color: 'var(--cc-text-disabled)',
          letterSpacing: '0.5px',
        }}>
          Contact your administrator for access
        </div>
      </div>
    </div>
  );
}
