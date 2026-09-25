'use client';

import {
  MessageCircle,
  User,
  Phone,
  Mail,
  ChevronRight,
  MapPin,
  Truck,
  CreditCard,
  ChevronDown,
  StickyNote,
  Pencil,
} from 'lucide-react';
import { formatGuaranies } from '@/lib/utils';
import { ContactDetailSheet } from '@/components/ContactDetailSheet';
import {
  ORDER_STATUS_LABELS,
  type Order,
  type OrderItem,
  type OrderStatus,
} from '@/types';

const STATUS_OPTIONS: OrderStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

interface OrderViewPanelProps {
  order: Order;
  items: OrderItem[];
  contactSheetOpen: boolean;
  onContactSheetOpenChange: (open: boolean) => void;
  statusSubmitting: boolean;
  onStatusChange: (status: OrderStatus) => void;
  onNotify: () => void;
}

export function OrderViewPanel({
  order,
  items,
  contactSheetOpen,
  onContactSheetOpenChange,
  statusSubmitting,
  onStatusChange,
  onNotify,
}: OrderViewPanelProps) {
  return (
    <>
      {/* Status control row */}
      <div className="order-control-row">
        <div className="status-pill-wrap">
          <select
            className={`status-pill status-${order.status}`}
            value={order.status}
            onChange={(e) => onStatusChange(e.target.value as OrderStatus)}
            aria-label="Estado del pedido"
            disabled={statusSubmitting}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <ChevronDown size={11} className="status-chevron" aria-hidden="true" />
        </div>
        <button type="button" className="whatsapp-btn" onClick={onNotify}>
          <MessageCircle size={15} />
          Notificar cliente
        </button>
      </div>

      {/* Cancelar con motivo — placeholder entry point for a future richer
          cancel flow (collects a short reason). The RPC that would back this
          is being built on a separate branch and does not exist on main yet,
          so this is intentionally disabled with no handler: cancelling an
          order today still only happens via the status <select> above
          (onStatusChange('cancelled')), which is untouched and fully
          functional. Kept visually distinct (dashed border + "Próximamente"
          badge) so it's never confused with that real, working path. */}
      <div className="cancel-reason-row">
        <button
          type="button"
          className="cancel-reason-btn"
          disabled
          aria-disabled="true"
          title="Disponible próximamente"
        >
          Cancelar con motivo
        </button>
        <span className="soon-badge">Próximamente</span>
      </div>

      {/* Cliente */}
      <div className="detail-card">
        <div className="detail-card-label">Cliente</div>
        <div className="detail-card-body">
          <div className="customer-name">{order.customer_name}</div>
          {order.customer_phone && (
            <div className="customer-meta">
              <Phone size={13} className="meta-icon" />
              <span>{order.customer_phone}</span>
            </div>
          )}
          {order.customer_email && (
            <div className="customer-meta">
              <Mail size={13} className="meta-icon" />
              <span>{order.customer_email}</span>
            </div>
          )}
          {order.contact_id && (
            <>
              <button
                type="button"
                className="contact-pill"
                onClick={() => onContactSheetOpenChange(true)}
              >
                <User size={13} />
                <span>Ver contacto vinculado</span>
                <ChevronRight size={13} />
              </button>
              <ContactDetailSheet
                contactId={order.contact_id}
                open={contactSheetOpen}
                onOpenChange={onContactSheetOpenChange}
                onEdit={() => onContactSheetOpenChange(false)}
              />
            </>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="detail-card">
        <div className="detail-card-label">Items</div>
        <ul className="items-list">
          {items.map((item) => (
            <li key={item.id} className="item-row">
              <div className="item-left">
                <span className="item-qty">{item.qty}×</span>
                <span className="item-name">{item.name_snapshot}</span>
              </div>
              <span className="item-total">{formatGuaranies(item.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="grand-total-row">
          <span>Total</span>
          <strong>
            {formatGuaranies(
              order.total + (order.delivery_type === 'delivery' ? (order.delivery_fee ?? 0) : 0)
            )}
          </strong>
        </div>
      </div>

      {/* Entrega & Pago */}
      <div className="detail-card">
        <div className="detail-card-label">Entrega & Pago</div>
        <div className="detail-card-body detail-row-group">
          <div className="detail-info-row">
            <Truck size={15} className="info-icon" />
            <span>
              {order.delivery_type === 'delivery'
                ? `Delivery${order.delivery_address ? ` — ${order.delivery_address}` : ''}`
                : 'Retiro en el local'}
            </span>
          </div>
          {order.delivery_type === 'delivery' && order.delivery_location && (
            <a
              href={`https://www.google.com/maps?q=${order.delivery_location.lat},${order.delivery_location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="detail-info-row maps-link"
            >
              <MapPin size={15} className="info-icon" />
              <span>Ver ubicación en Maps</span>
            </a>
          )}
          {order.delivery_type === 'delivery' && order.delivery_fee != null && (
            <div className="detail-info-row fee-row">
              <Truck size={15} className="info-icon" style={{ opacity: 0 }} aria-hidden="true" />
              <span className="delivery-fee-badge">Delivery: {formatGuaranies(order.delivery_fee)}</span>
              {/* Edit-fee placeholder — same reasoning as "Cancelar con
                  motivo" above: no RPC exists yet on main to back this, so
                  it's a disabled, non-wired entry point only. */}
              <button
                type="button"
                className="fee-edit-btn"
                disabled
                aria-disabled="true"
                title="Disponible próximamente"
                aria-label="Editar fee de delivery (disponible próximamente)"
              >
                <span className="fee-edit-visual">
                  <Pencil size={13} aria-hidden="true" />
                </span>
              </button>
            </div>
          )}
          <div className="detail-info-row">
            <CreditCard size={15} className="info-icon" />
            <span>{order.payment_method === 'efectivo' ? 'Efectivo' : 'Transferencia'}</span>
          </div>
        </div>
      </div>

      {/* Nota */}
      {order.note && (
        <div className="detail-card">
          <div className="detail-card-label">Nota</div>
          <div className="detail-card-body">
            <div className="order-note">
              <StickyNote size={13} className="info-icon" />
              <span>{order.note}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
