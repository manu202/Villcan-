interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Descartar',
  cancelLabel = 'Cancelar',
}: ConfirmModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '24px',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--surface-elevated)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '320px',
          width: '100%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          style={{
            fontSize: '15px',
            fontWeight: '500',
            color: 'var(--text-primary)',
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          {message}
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '12px',
              background: '#DC2626',
              color: 'var(--danger-foreground)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
