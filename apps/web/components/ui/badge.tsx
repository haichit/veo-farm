import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  idle: 'bg-emerald-100 text-emerald-700',
  busy: 'bg-amber-100 text-amber-700',
  cooldown: 'bg-sky-100 text-sky-700',
  expired: 'bg-orange-100 text-orange-700',
  die: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-700',
};

export function Badge({ status, children, className }: { status?: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        status ? styles[status] ?? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-700',
        className,
      )}
    >
      {children}
    </span>
  );
}
