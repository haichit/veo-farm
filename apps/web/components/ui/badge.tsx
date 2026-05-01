import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  idle: 'bg-success-bg text-success border-success/30',
  busy: 'bg-warning-bg text-warning border-warning/30',
  cooldown: 'bg-info/10 text-info border-info/30',
  expired: 'bg-warning-bg text-warning border-warning/30',
  die: 'bg-error-bg text-error border-error/30',
  pending: 'bg-white/[0.04] text-text-muted border-border',
  running: 'bg-info/10 text-info border-info/30 animate-pulse',
  completed: 'bg-success-bg text-success border-success/30',
  failed: 'bg-error-bg text-error border-error/30',
  cancelled: 'bg-white/[0.04] text-text-muted border-border',
};

export function Badge({
  status,
  children,
  className,
}: {
  status?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        status
          ? (styles[status] ?? 'bg-white/[0.04] text-text-muted border-border')
          : 'bg-white/[0.04] text-text-muted border-border',
        className,
      )}
    >
      {children}
    </span>
  );
}
