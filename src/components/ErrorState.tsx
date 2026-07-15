interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Ocurrió un error', onRetry }: ErrorStateProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
      }}
    >
      <div
        style={{
          fontSize: '48px',
          marginBottom: '16px',
        }}
      >
        ⚠️
      </div>
      <h3
        style={{
          fontSize: '18px',
          fontWeight: '600',
          color: 'var(--black)',
          marginBottom: '8px',
        }}
      >
        {message}
      </h3>
      <p
        style={{
          fontSize: '14px',
          color: 'var(--gray-500)',
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
            background: 'var(--black)',
            color: 'var(--white)',
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