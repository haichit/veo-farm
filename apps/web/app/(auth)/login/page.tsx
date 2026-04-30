'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setStatus('error');
    } else {
      setStatus('sent');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Veo Farm — Đăng nhập</CardTitle>
          <CardDescription>Magic link sẽ được gửi tới email của mày.</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'sent' ? (
            <p className="text-sm">Check email <strong>{email}</strong> rồi click link để vào.</p>
          ) : (
            <form onSubmit={send} className="space-y-3">
              <Input
                type="email"
                required
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={status === 'sending'} className="w-full">
                {status === 'sending' ? 'Đang gửi...' : 'Gửi magic link'}
              </Button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
