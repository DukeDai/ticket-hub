'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 disabled:bg-gray-300',
  secondary: 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50',
  danger: 'bg-red-500 text-white hover:bg-red-600',
  ghost: 'text-gray-700 hover:bg-gray-100',
};

const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    loading,
    block,
    className,
    children,
    disabled,
    ...rest
  }: ButtonProps,
  ref
) {
  const v: Variant = variant ?? 'primary';
  const s: Size = size ?? 'md';
  const isLoading = Boolean(loading);
  const isBlock = Boolean(block);
  return (
    <button
      ref={ref}
      disabled={Boolean(disabled) || isLoading}
      className={[
        'inline-flex items-center justify-center rounded-md font-medium transition',
        'disabled:cursor-not-allowed',
        variants[v],
        sizes[s],
        isBlock ? 'w-full' : '',
        className ?? '',
      ].join(' ')}
      {...rest}
    >
      {isLoading ? '处理中…' : (children as ReactNode)}
    </button>
  );
});
