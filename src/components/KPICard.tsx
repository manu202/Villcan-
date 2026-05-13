import { formatGuaranies } from '@/lib/utils';

interface KPICardProps {
  label: string;
  value: number;
  variant?: 'default' | 'highlight' | 'muted';
  size?: 'sm' | 'md' | 'lg';
}

export function KPICard({ label, value, variant = 'default', size = 'md' }: KPICardProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  const variantClasses = {
    default: 'bg-white border-gray-200',
    highlight: 'bg-black text-white border-transparent',
    muted: 'bg-gray-50 border-gray-200',
  };

  return (
    <div className={`kpi-card ${variantClasses[variant]}`}>
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${sizeClasses[size]}`}>{formatGuaranies(value)}</span>
      <style>{`
        .kpi-card {
          border: 1px solid;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .kpi-label {
          font-size: 12px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--gray-500);
        }

        .kpi-value {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .kpi-card.highlight .kpi-label {
          color: var(--gray-400);
        }
      `}</style>
    </div>
  );
}