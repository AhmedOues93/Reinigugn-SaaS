import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@reinigung/ui';
import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react';

const buttonVariants = cva(
  'inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50',
  { variants: { variant: { default: 'bg-primary text-primary-foreground hover:bg-primary/90', outline: 'border bg-white hover:bg-muted', ghost: 'hover:bg-muted' } }, defaultVariants: { variant: 'default' } },
);

export function Button({ className, variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary', className)} {...props} />;
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}>{children}</section>;
}
