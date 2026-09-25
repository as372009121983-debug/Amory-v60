import React from 'react';
import { formatCurrency } from '../../lib/formatters';

interface FitNumberProps {
  value: number | string;
  currency?: string | boolean;
  className?: string;
  maxDecimals?: number;
  showSign?: boolean;
}

/**
 * FitNumber: Displays numbers cleanly with tabular-nums, never truncates digits,
 * and scales down font size automatically if the number is large.
 */
export const FitNumber: React.FC<FitNumberProps> = ({
  value,
  currency,
  className = '',
  maxDecimals = 2,
  showSign = false,
}) => {
  const num = typeof value === 'number' ? (isNaN(value) ? 0 : value) : (parseFloat(String(value)) || 0);
  
  let formatted = '';
  if (typeof currency === 'string') {
    formatted = `${num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    })} ${currency}`;
  } else if (currency === true) {
    formatted = formatCurrency(num);
  } else {
    formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    });
  }

  if (showSign && num > 0) {
    formatted = `+${formatted}`;
  }

  // Size scaling based on character length
  const len = formatted.length;
  let dynamicSizeClass = '';
  if (len > 14) {
    dynamicSizeClass = 'text-xs sm:text-sm';
  } else if (len > 10) {
    dynamicSizeClass = 'text-sm sm:text-base';
  }

  return (
    <span
      className={`tabular-nums font-mono min-w-0 select-all whitespace-nowrap inline-block ${dynamicSizeClass} ${className}`}
      dir="ltr"
    >
      {formatted}
    </span>
  );
};
