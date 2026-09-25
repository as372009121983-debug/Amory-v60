import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  iconPosition = 'start',
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-bold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98] cursor-pointer';

  const variants = {
    primary:
      'bg-amber-500 hover:bg-amber-600 text-zinc-950 focus:ring-amber-500 shadow-md shadow-amber-500/20 border border-amber-400/40',
    secondary:
      'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-100 focus:ring-slate-400 dark:focus:ring-zinc-600 border border-slate-300 dark:border-zinc-700/60 shadow-xs',
    danger:
      'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500 shadow-md shadow-rose-600/20 border border-rose-500/40',
    success:
      'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500 shadow-md shadow-emerald-600/20 border border-emerald-500/40',
    ghost:
      'bg-transparent hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white focus:ring-slate-400 dark:focus:ring-zinc-600',
    outline:
      'bg-transparent border border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500 text-slate-800 dark:text-zinc-200 hover:bg-slate-100/70 dark:hover:bg-zinc-800/50 focus:ring-slate-400 dark:focus:ring-zinc-600',
  };

  const sizes = {
    sm: 'text-xs px-2.5 py-1.5 min-h-[36px] rounded-lg gap-1.5',
    md: 'text-sm px-4 py-2 min-h-[44px] rounded-xl gap-2',
    lg: 'text-base px-5 py-2.5 min-h-[48px] rounded-xl gap-2.5',
    xl: 'text-lg px-6 py-3.5 min-h-[56px] rounded-2xl gap-3 font-black',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        icon && iconPosition === 'start' && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
      {!isLoading && icon && iconPosition === 'end' && <span className="shrink-0">{icon}</span>}
    </button>
  );
};
