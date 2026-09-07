'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatGuaranies, formatRelativeTime } from '@/lib/utils';
import { buildStatusNotificationMessage, buildWhatsAppLink } from '@/lib/storefront';
import { useSettings } from '@/contexts/SettingsContext';
import { ORDER_STATUS_LABELS, type OrderStatus, type OrderWithItems } from '@/types';
import { Spinner } from '@/components/Spinner';
import { MessageCircle, ExternalLink } from 'lucide-react';

const STATUS_OPTIONS: OrderStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

interface OrderDetailSheetProps {
  orderId: string;
  onClose: () => void;
}

export function OrderDetailSheet({ orderId, onClose }: OrderDetailSheetProps) {
  const { settings } = useSettings();
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single();

      if (!cancelled) {
        setOrder(data as OrderWithItems);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [orderId]);

  const handleStatusChange = async (status: OrderStatus) => {
    if (!order) return;
    setOrder((prev) => prev ? { ...prev, status } : prev);
    const supabase = createClient();
    await supabase.from('orders').update({ status }).eq('id', orderId);
  };

  const handleNotify = () => {
    if (!order) return;
    const message = buildStatusNotificationMessage(order, settings.business_name);
    const link = buildWhatsAppLink(order.customer_phone, message);
    window.open(link, '_blank');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
        <Spinner size={28} color="black" />
      </div>
    );
  }

  if (!order) {
    return <p style={{ padding: '16px', color: 'var(--text-secondary)' }}>Pedido no encontrado.</p>;
  }

  return (
    <div className="ods">
      <div className="ods-meta">
        <span className="ods-code">#{order.order_code}</span>
        <span className="ods-time">{formatRelativeTime(order.created_at)}</span>
      </div>

      <div className="ods-customer">
        <p className="ods-name">{order.customer_name}</p>
        {order.customer_phone && <p className="ods-phone">{order.customer_phone}</p>}
      </div>

      {order.order_items.length > 0 && (
        <ul className="ods-items">
          {order.order_items.map((item) => (
            <li key={item.id} className="ods-item">
              <span className="ods-item-name">{item.qty}× {item.name_snapshot}</span>
              <span className="ods-item-price">{formatGuaranies(item.line_total)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="ods-total">
        <span>Total</span>
        <strong>{formatGuaranies(order.total)}</strong>
      </div>

      {order.note && <p className="ods-note">{order.note}</p>}

      <div className="ods-actions">
        <select
          className={`ods-status-select status-${order.status}`}
          value={order.status}
          onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
          aria-label="Estado del pedido"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
          ))}
        </select>

        <button type="button" className="ods-btn-notify" onClick={handleNotify} aria-label="Notificar cliente">
          <MessageCircle size={16} aria-hidden="true" />
          WhatsApp
        </button>
      </div>

      <Link href={`/orders/${order.id}`} className="ods-link-full" onClick={onClose}>
        <ExternalLink size={14} aria-hidden="true" />
        Ver / Editar pedido completo
      </Link>

      <style>{`
        .ods { display: flex; flex-direction: column; gap: 16px; }
        .ods-meta { display: flex; justify-content: space-between; align-items: center; }
        .ods-code { font-size: 18px; font-weight: 700; font-family: monospace; letter-spacing: 0.05em; color: var(--text-primary); }
        .ods-time { font-size: 12px; color: var(--text-secondary); }
        .ods-customer { display: flex; flex-direction: column; gap: 2px; }
        .ods-name { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
        .ods-phone { font-size: 13px; color: var(--text-secondary); margin: 0; }
        .ods-items { list-style: none; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .ods-item { display: flex; justify-content: space-between; padding: 10px 12px; font-size: 14px; }
        .ods-item + .ods-item { border-top: 1px solid var(--border); }
        .ods-item-name { color: var(--text-primary); }
        .ods-item-price { color: var(--text-secondary); font-variant-numeric: tabular-nums; }
        .ods-total { display: flex; justify-content: space-between; padding: 4px 0; font-size: 15px; color: var(--text-primary); border-top: 2px solid var(--border); padding-top: 12px; }
        .ods-note { font-size: 13px; color: var(--text-secondary); background: var(--accent-subtle); padding: 10px 12px; border-radius: 8px; margin: 0; }
        .ods-actions { display: flex; gap: 8px; }
        .ods-status-select { flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--surface); color: var(--text-primary); }
        .ods-btn-notify { display: flex; align-items: center; gap: 6px; padding: 10px 14px; background: #25D366; color: #fff; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
        .ods-link-full { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); text-decoration: none; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; justify-content: center; }
        .ods-link-full:active { background: var(--accent-subtle); }
      `}</style>
    </div>
  );
}
