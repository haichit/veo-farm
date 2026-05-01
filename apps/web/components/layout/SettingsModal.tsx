'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Settings as SettingsIcon, Server, Cookie, Database, Workflow } from 'lucide-react';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  email: string;
}

export function SettingsModal({ open, onClose, email }: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-accent" />
            Cài đặt
          </DialogTitle>
          <DialogDescription>Thông tin runtime · phiên bản 0.1.0</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field icon={<Server className="w-4 h-4" />} label="Tài khoản" value={email || '—'} />
          <Field
            icon={<Database className="w-4 h-4" />}
            label="Backend"
            value="Supabase (Postgres + Realtime)"
          />
          <Field
            icon={<Workflow className="w-4 h-4" />}
            label="Worker"
            value="@veo-farm/worker · poll Postgres jobs"
          />
          <Field
            icon={<Cookie className="w-4 h-4" />}
            label="Mã hoá cookies"
            value="AES-256-GCM (ENCRYPTION_KEY)"
          />

          <div className="text-[11px] text-text-muted leading-relaxed pt-2 border-t border-border">
            Settings panel này placeholder. Sẽ thêm: theme switch, worker heartbeat
            ping, captcha-server health, log level. Nếu cần sửa env biến, edit `.env`
            rồi restart worker.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-accent-glow flex items-center justify-center text-accent shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-text-muted">{label}</div>
        <div className="text-sm text-text-primary truncate">{value}</div>
      </div>
    </div>
  );
}
