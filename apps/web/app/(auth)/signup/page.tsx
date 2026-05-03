'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Lock, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BackgroundEffects } from '@/components/ui/BackgroundEffects';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientLogo } from '@/components/ui/GradientLogo';
import { GradientText } from '@/components/ui/GradientText';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (password.length < 8) {
      setAlert({ type: 'error', msg: 'Mật khẩu tối thiểu 8 ký tự' });
      return;
    }
    if (password !== confirm) {
      setAlert({ type: 'error', msg: 'Mật khẩu nhập lại không khớp' });
      return;
    }
    setLoading(true);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setAlert({ type: 'error', msg: error.message });
    else
      setAlert({
        type: 'success',
        msg: `📬 Đã gửi email xác nhận tới ${email}. Vào hộp thư và bấm link để kích hoạt tài khoản.`,
      });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 relative">
      <BackgroundEffects />
      <div className="w-full max-w-[440px] z-10">
        <GlassCard appear className="p-10">
          <div className="text-center mb-8">
            <GradientLogo icon="🎬" size={64} className="mb-4" />
            <h1 className="text-2xl font-bold tracking-tight mb-1.5">
              <GradientText>Tạo tài khoản</GradientText>
            </h1>
            <p className="text-sm text-text-muted">Đăng ký để dùng Veo Farm</p>
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

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5 tracking-wide">
                MẬT KHẨU
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 8 ký tự"
                  className="pl-11 h-12 bg-bg-input border-border focus:border-accent rounded-[10px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5 tracking-wide">
                NHẬP LẠI MẬT KHẨU
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
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
                <UserPlus className="w-5 h-5" />
              )}
              Tạo tài khoản
            </Button>
          </form>

          <p className="text-center mt-5 text-xs text-text-muted">
            Đã có tài khoản?{' '}
            <Link href="/login" className="text-accent hover:underline">
              Đăng nhập
            </Link>
          </p>
        </GlassCard>
      </div>
    </div>
  );
}
