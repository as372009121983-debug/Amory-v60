import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'amber' | 'emerald' | 'rose' | 'blue' | 'zinc' | 'purple';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'zinc',
  size = 'md',
  className = '',
  ...props
}) => {
  const variants = {
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    rose: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
    blue: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
    zinc: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
    purple: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30',
  };

  const sizes = {
    sm: 'text-[10px] px-1.5 py-0.5 rounded-md font-semibold',
    md: 'text-xs px-2.5 py-1 rounded-lg font-bold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 border select-none ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
