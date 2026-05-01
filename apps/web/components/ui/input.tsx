import * as React from 'react';
import { cn } from '@/lib/utils';

const FIELD_BASE =
  'flex w-full rounded-lg border border-border bg-bg-input text-sm text-text-primary shadow-sm transition-colors placeholder:text-text-muted focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        FIELD_BASE,
        'h-9 px-3 py-1 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text-secondary',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(FIELD_BASE, 'min-h-[60px] px-3 py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';
