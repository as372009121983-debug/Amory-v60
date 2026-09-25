import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, suffix, className = '', id, value, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substring(2, 7)}`;
    const safeValue = typeof value === 'number' && isNaN(value) ? '' : value;

    return (
      <div className="w-full space-y-1.5 text-right">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute start-3 flex items-center pointer-events-none text-zinc-400">
              {icon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            value={safeValue}
            className={`w-full bg-white dark:bg-zinc-900 border text-base text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 rounded-xl min-h-[44px] transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed ${
              icon ? 'ps-10' : 'ps-3.5'
            } ${suffix ? 'pe-10' : 'pe-3.5'} ${
              error ? 'border-rose-500 focus:ring-rose-500' : 'border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'
            } ${className}`}
            {...props}
          />
          {suffix && (
            <div className="absolute end-3 flex items-center text-zinc-400">
              {suffix}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}
        {hint && !error && <p className="text-[11px] text-zinc-400">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
