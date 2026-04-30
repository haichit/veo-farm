'use client';

import { useState } from 'react';
import { Mail, LogIn, UserPlus, Rocket, CheckCircle2, AlertCircle } from 'lucide-react';
import { BackgroundEffects } from '@/components/ui/BackgroundEffects';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientLogo } from '@/components/ui/GradientLogo';
import { GradientText } from '@/components/ui/GradientText';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type AlertState = { type: 'info' | 'success' | 'error'; msg: string } | null;

export default function LoginPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAlert(null);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setAlert({ type: 'error', msg: error.message });
    else setAlert({ type: 'success', msg: `📬 Đã gửi magic link tới ${email}` });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 relative">
      <BackgroundEffects />

      <div className="w-full max-w-[440px] z-10">
        <GlassCard appear className="p-10">
          <div className="text-center mb-8">
            <GradientLogo icon="🎬" size={64} className="mb-4" />
            <h1 className="text-2xl font-bold tracking-tight mb-1.5">
              <GradientText>Veo Farm</GradientText>
            </h1>
            <p className="text-sm text-text-muted">Đăng nhập để sử dụng tool</p>
          </div>

          <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl mb-7 border border-border">
            <button
              type="button"
              onClick={() => setTab('login')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-[10px] text-[13px] font-semibold transition-all
                ${
                  tab === 'login'
                    ? 'bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
            >
              <LogIn className="w-4 h-4" /> Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => setTab('register')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-[10px] text-[13px] font-semibold transition-all
                ${
                  tab === 'register'
                    ? 'bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
            >
              <UserPlus className="w-4 h-4" /> Đăng ký
            </button>
          </div>

          {alert && (
            <div
              role="status"
              className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                alert.type === 'error'
                  ? 'bg-error-bg border-error/30 text-error'
                  : alert.type === 'success'
                    ? 'bg-success-bg border-success/30 text-success'
                    : 'bg-info/10 border-info/30 text-info'
              }`}
            >
              {alert.type === 'error' ? (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <span>{alert.msg}</span>
            </div>
          )}

          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-text-secondary mb-1.5 tracking-wide"
              >
                EMAIL
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-11 h-12 bg-bg-input border-border focus:border-accent focus-visible:ring-accent/40 rounded-[10px] text-text-primary placeholder:text-text-muted"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="w-full h-12 rounded-xl text-sm font-bold gap-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-slow" />
              ) : (
                <Rocket className="w-5 h-5" />
              )}
              {tab === 'login' ? 'Gửi Link Đăng nhập' : 'Tạo tài khoản'}
            </Button>
          </form>
        </GlassCard>

        <div className="text-center mt-6 text-xs text-text-muted">Phiên bản 0.1.0 · Veo Farm</div>
      </div>
    </div>
  );
}
