import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'تأكيد',
  cancelText = 'إلغاء',
  variant = 'danger',
  isLoading = false,
}) => {
  const icons = {
    danger: <AlertTriangle className="w-6 h-6 text-rose-400" />,
    warning: <AlertTriangle className="w-6 h-6 text-amber-400" />,
    primary: <Info className="w-6 h-6 text-cyan-400" />,
  };

  const iconBgs = {
    danger: 'bg-rose-500/15 border-rose-500/30',
    warning: 'bg-amber-500/15 border-amber-500/30',
    primary: 'bg-cyan-500/15 border-cyan-500/30',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm" showCloseButton={false}>
      <div className="text-center space-y-4">
        <div
          className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center border ${iconBgs[variant]}`}
        >
          {icons[variant]}
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">{title}</h3>
          <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">{message}</p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            className="flex-1"
            isLoading={isLoading}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
