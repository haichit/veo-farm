import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GradientLogoProps {
  icon: ReactNode;
  size?: number;
  className?: string;
}

export function GradientLogo({ icon, size = 64, className }: GradientLogoProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-[20px]',
        'bg-gradient-to-br from-accent to-secondary',
        'shadow-accent-glow animate-logo-pulse',
        className,
      )}
      style={{ width: size, height: size, fontSize: size / 2 }}
    >
      {icon}
    </div>
  );
}
