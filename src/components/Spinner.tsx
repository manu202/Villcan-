interface SpinnerProps {
  size?: 24 | 36 | 48;
  color?: 'gray' | 'black';
}

export function Spinner({ size = 24, color = 'gray' }: SpinnerProps) {
  const strokeColor = color === 'black' ? 'var(--text-primary)' : 'var(--text-muted)';
  const strokeWidth = size === 48 ? 3 : size === 36 ? 2.5 : 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}