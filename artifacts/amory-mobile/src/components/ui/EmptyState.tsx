import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-3xl bg-slate-50 dark:bg-zinc-950/40 select-none ${className}`}
    >
      <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-slate-400 dark:text-zinc-400 mb-4 shadow-sm shadow-slate-200/50 dark:shadow-none">
        {icon}
      </div>
      <h4 className="text-base font-black text-slate-800 dark:text-zinc-200 mb-1">{title}</h4>
      {description && <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mb-5 leading-relaxed">{description}</p>}
      {actionText && onAction && (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
};
