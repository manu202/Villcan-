'use client';

import {
  Banknote, Smartphone, CreditCard, ShoppingBag, Wallet, ArrowDownLeft,
  type LucideIcon,
} from 'lucide-react';
import { formatGuaranies, formatTime, getMovementTypeLabel } from '@/lib/utils';
import type { MovementWithDetails, PaymentMethod } from '@/types';

interface MovementCardProps {
  movement: MovementWithDetails;
  onClick: (id: string) => void;
}

type IconName = 'Banknote' | 'Smartphone' | 'CreditCard' | 'ShoppingBag' | 'Wallet' | 'ArrowDownLeft';

const ICON_MAP: Record<IconName, LucideIcon> = {
  Banknote,
  Smartphone,
  CreditCard,
  ShoppingBag,
  Wallet,
  ArrowDownLeft,
};

function resolveIcon(movement: MovementWithDetails): IconName {
  if (movement.type === 'servicio') {
    const pm = movement.payment_method as PaymentMethod | null;
    if (pm === 'transferencia') return 'Smartphone';
    if (pm === 'pos') return 'CreditCard';
    return 'Banknote';
  }
  if (movement.type === 'gasto') return 'ShoppingBag';
  if (movement.type === 'apertura') return 'Wallet';
  return 'ArrowDownLeft'; // cierre
}

// Icon background tint per type
const ICON_BG: Partial<Record<string, string>> = {
  servicio: 'rgba(16,185,129,0.12)',  // emerald tint
  gasto:    'rgba(244,63,94,0.10)',   // rose tint
  apertura: 'rgba(59,130,246,0.12)', // blue tint
  cierre:   'rgba(156,163,175,0.15)', // gray tint
};
const ICON_COLOR: Partial<Record<string, string>> = {
  servicio: '#10b981',
  gasto:    '#f43f5e',
  apertura: '#3b82f6',
  cierre:   '#9ca3af',
};

export function MovementCard({ movement, onClick }: MovementCardProps) {
  const net =
    movement.type === 'servicio'
      ? (movement.amount_charged ?? movement.income)
      : movement.income - movement.expense;

  const isPositive = net >= 0;
  const sign = isPositive ? '+' : '−';
  const absNet = Math.abs(net);

  const title =
    movement.service?.name ??
    movement.comment ??
    getMovementTypeLabel(movement.type);

  const subtitle = movement.contact?.full_name ?? null;

  const iconName = resolveIcon(movement);
  const Icon = ICON_MAP[iconName];
  const iconBg = ICON_BG[movement.type] ?? 'rgba(156,163,175,0.15)';
  const iconColor = ICON_COLOR[movement.type] ?? '#9ca3af';

  return (
    <li
      className="mc-card"
      data-testid={`movement-card-${movement.id}`}
      onClick={() => onClick(movement.id)}
    >
      {/* Left: icon */}
      <div
        className="mc-icon"
        data-testid="movement-icon"
        data-icon={iconName}
        style={{ background: iconBg }}
      >
        <Icon size={18} color={iconColor} aria-hidden="true" />
      </div>

      {/* Center: title + subtitle */}
      <div className="mc-body">
        <span className="mc-title">{title}</span>
        <span className="mc-sub">
          {subtitle && <span className="mc-sub-name">{subtitle}</span>}
          {subtitle && <span className="mc-sep"> · </span>}
          <span className="mc-time">{formatTime(movement.created_at)}</span>
        </span>
      </div>

      {/* Right: amount */}
      <span
        className={`mc-amount ${isPositive ? 'mc-amount--positive' : 'mc-amount--negative'}`}
        data-testid="movement-amount"
      >
        {sign}{formatGuaranies(absNet)}
      </span>

      <style>{`
        .mc-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          min-height: 64px;
          background: var(--surface);
          cursor: pointer;
          list-style: none;
          border-radius: 12px;
          border: 1px solid var(--border);
          transition: background 0.1s;
        }
        .mc-card:active { background: var(--surface-elevated); }

        .mc-icon {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mc-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .mc-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mc-sub {
          font-size: 12px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mc-amount {
          flex-shrink: 0;
          font-size: 15px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          text-align: right;
        }

        .mc-amount--positive { color: #10b981; }
        .mc-amount--negative { color: #f43f5e; }
      `}</style>
    </li>
  );
}
