interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
      }}
    >
      {icon && (
        <div
          style={{
            fontSize: '48px',
            marginBottom: '16px',
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          fontSize: '18px',
          fontWeight: '600',
          color: 'var(--black)',
          marginBottom: '8px',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: '14px',
          color: 'var(--gray-500)',
          marginBottom: '20px',
        }}
      >
        {message}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            padding: '12px 20px',
            background: 'var(--black)',
            color: 'var(--white)',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}