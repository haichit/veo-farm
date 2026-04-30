import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GradientTextProps {
  children: ReactNode;
  className?: string;
}

export function GradientText({ children, className }: GradientTextProps) {
  return (
    <span
      className={cn(
        'bg-gradient-to-br from-text-primary to-[#a78bfa]',
        'bg-clip-text text-transparent',
        className,
      )}
    >
      {children}
    </span>
  );
}
