import type { LucideIcon } from 'lucide-react';
import { formatGuaranies } from '@/lib/utils';

interface KPICardProps {
  label: string;
  value: number;
  variant?: 'default' | 'highlight' | 'muted';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
}

export function KPICard({ label, value, variant = 'default', size = 'md', icon: Icon }: KPICardProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <div className={`kpi-card ${variant}`}>
      <div className="kpi-header">
        {Icon && <Icon size={16} className="kpi-icon" aria-hidden="true" />}
        <span className="kpi-label">{label}</span>
      </div>
      <span className={`kpi-value ${sizeClasses[size]}`}>{formatGuaranies(value)}</span>
      <style>{`
        .kpi-card {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: var(--surface);
          box-shadow: var(--shadow-sm);
        }

        .kpi-card.muted {
          background: var(--surface-elevated);
        }

        .kpi-card.highlight {
          background: var(--accent);
          color: var(--accent-foreground);
          border-color: transparent;
        }

        .kpi-header {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .kpi-label {
          font-size: 12px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
        }

        .kpi-icon {
          color: var(--text-secondary);
        }

        .kpi-value {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .kpi-card.highlight .kpi-label,
        .kpi-card.highlight .kpi-icon {
          color: var(--accent-foreground);
          opacity: 0.75;
        }
      `}</style>
    </div>
  );
}
