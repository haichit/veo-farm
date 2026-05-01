import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-red-500 text-white hover:bg-red-600',
        outline: 'border border-input bg-bg-input hover:bg-bg-card-hover hover:text-text-primary',
        link: 'text-accent underline-offset-4 hover:underline',
        // Glass-morphism variants (SPEC §19.4)
        primary:
          'bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow hover:shadow-accent-glow-lg hover:-translate-y-0.5',
        success:
          'bg-gradient-to-br from-success to-[#059669] text-white shadow-success-glow hover:-translate-y-0.5',
        secondary:
          'bg-white/[0.03] border border-border text-text-secondary hover:bg-white/[0.06] hover:text-text-primary',
        danger:
          'bg-error-bg border border-error/30 text-error hover:bg-error/15 hover:border-error',
        teal: 'bg-gradient-to-br from-[#2dd4bf] to-[#0f766e] text-white shadow-[0_4px_20px_rgba(20,184,166,0.3)] hover:-translate-y-0.5',
        ghost: 'text-text-muted hover:text-text-secondary hover:bg-white/[0.06]',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';
export { buttonVariants };
