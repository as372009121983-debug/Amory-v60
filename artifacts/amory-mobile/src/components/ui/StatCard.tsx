import React from 'react';
import { Card } from './Card';
import { FitNumber } from './FitNumber';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: 'amber' | 'emerald' | 'rose' | 'blue' | 'zinc';
  trend?: {
    value: string;
    isPositive: boolean;
  };
  className?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  variant = 'amber',
  trend,
  className = '',
  onClick,
}) => {
  const iconBgStyles = {
    amber: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    rose: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
    blue: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
    zinc: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
  };

  const valueColors = {
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    blue: 'text-cyan-600 dark:text-cyan-400',
    zinc: 'text-zinc-900 dark:text-zinc-100',
  };

  return (
    <Card
      padding="sm"
      className={`relative overflow-hidden group select-none ${
        onClick ? 'cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-700 hover:shadow-lg transition-transform active:scale-[0.99]' : ''
      } ${className}`}
      onClick={onClick}
    >
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 wrap-text min-w-0">{title}</span>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBgStyles[variant]}`}>
            {icon}
          </div>
        </div>

        <div className="space-y-1">
          <div className={`text-xl sm:text-2xl font-black font-mono tracking-tight tabular-nums ${valueColors[variant]}`}>
            {typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value))) ? (
              <FitNumber value={value} className="block" />
            ) : (
              <span className="block truncate text-base sm:text-lg">{value}</span>
            )}
          </div>
          {(subtitle || trend) && (
            <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 pt-0.5">
              {subtitle && <span className="wrap-text min-w-0">{subtitle}</span>}
              {trend && (
                <span
                  className={`font-mono font-bold shrink-0 ${
                    trend.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {trend.isPositive ? '+' : ''}
                  {trend.value}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
