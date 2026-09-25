import React from 'react';

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {}

export const Kbd: React.FC<KbdProps> = ({ children, className = '', ...props }) => {
  return (
    <kbd
      className={`inline-flex items-center justify-center font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-300 shadow-xs select-none ${className}`}
      {...props}
    >
      {children}
    </kbd>
  );
};
