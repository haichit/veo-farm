'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BackgroundEffects } from '@/components/ui/BackgroundEffects';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientLogo } from '@/components/ui/GradientLogo';
import { GradientText } from '@/components/ui/GradientText';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    setLoading(true);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) setAlert({ type: 'error', msg: error.message });
    else setAlert({ type: 'success', msg: `📬 Link đặt lại mật khẩu đã được gửi tới ${email}` });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 relative">
      <BackgroundEffects />
      <div className="w-full max-w-[440px] z-10">
        <GlassCard appear className="p-10">
          <div className="text-center mb-8">
            <GradientLogo icon="🎬" size={64} className="mb-4" />
            <h1 className="text-2xl font-bold tracking-tight mb-1.5">
              <GradientText>Quên mật khẩu</GradientText>
            </h1>
            <p className="text-sm text-text-muted">Nhập email để nhận link đặt lại</p>
          </div>

          {alert && (
            <div
              className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                alert.type === 'error'
                  ? 'bg-error-bg border-error/30 text-error'
                  : 'bg-success-bg border-success/30 text-success'
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

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5 tracking-wide">
                EMAIL
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-11 h-12 bg-bg-input border-border focus:border-accent rounded-[10px]"
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
                <KeyRound className="w-5 h-5" />
              )}
              Gửi link đặt lại
            </Button>
          </form>

          <p className="text-center mt-5 text-xs text-text-muted">
            <Link href="/login" className="text-accent hover:underline">
              ← Quay lại đăng nhập
            </Link>
          </p>
        </GlassCard>
      </div>
    </div>
  );
}
