import { CheckCircle2, AlertCircle, Info, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  type: ToastType;
  message: string;
}

const config: Record<ToastType, { icon: typeof CheckCircle2; bg: string; text: string; iconColor: string }> = {
  success: { icon: CheckCircle2, bg: 'bg-success-50 border-success-200', text: 'text-success-700', iconColor: 'text-success-500' },
  error: { icon: XCircle, bg: 'bg-error-50 border-error-200', text: 'text-error-700', iconColor: 'text-error-500' },
  warning: { icon: AlertCircle, bg: 'bg-warning-50 border-warning-200', text: 'text-warning-700', iconColor: 'text-warning-500' },
  info: { icon: Info, bg: 'bg-info-50 border-info-200', text: 'text-info-700', iconColor: 'text-info-500' },
};

export function Toast({ type, message }: ToastProps) {
  const { icon: Icon, bg, text, iconColor } = config[type];
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border ${bg} ${text} shadow-card-hover animate-slide-up`}>
      <Icon size={18} className={`shrink-0 ${iconColor}`} />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

export function ToastContainer({ toasts }: { toasts: { id: string; type: ToastType; message: string }[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2.5 max-w-sm">
      {toasts.map((t) => (
        <Toast key={t.id} type={t.type} message={t.message} />
      ))}
    </div>
  );
}
