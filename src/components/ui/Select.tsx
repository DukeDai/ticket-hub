'use client';

import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className = '', children, ...rest },
  ref
) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>}
      <select
        ref={ref}
        className={[
          'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none',
          'focus:border-brand-500',
          className,
        ].join(' ')}
        {...rest}
      >
        {children as ReactNode}
      </select>
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>
  );
});
