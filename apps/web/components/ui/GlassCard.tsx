import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  appear?: boolean;
}

export function GlassCard({ className, children, appear, ...rest }: GlassCardProps) {
  return (
    <div
      className={cn(
        'bg-glass backdrop-blur-glass border border-glass-border rounded-[24px]',
        'shadow-glass relative overflow-hidden',
        appear && 'animate-card-appear',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
