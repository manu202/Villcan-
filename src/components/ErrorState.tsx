import { AlertTriangle, type LucideIcon } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  icon?: LucideIcon;
}

export function ErrorState({ message = 'Ocurrió un error', onRetry, icon: Icon = AlertTriangle }: ErrorStateProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '16px',
          color: 'var(--danger)',
        }}
      >
        <Icon size={48} aria-hidden="true" />
      </div>
      <h3
        style={{
          fontSize: '18px',
          fontWeight: '600',
          color: 'var(--text-primary)',
          marginBottom: '8px',
        }}
      >
        {message}
      </h3>
      <p
        style={{
          fontSize: '14px',
          color: 'var(--text-secondary)',
          marginBottom: '20px',
        }}
      >
        No se pudo cargar la información
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '12px 20px',
            background: 'var(--accent)',
            color: 'var(--accent-foreground)',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
