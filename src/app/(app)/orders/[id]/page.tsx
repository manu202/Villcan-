'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  MessageCircle,
  User,
  Phone,
  Mail,
  ChevronRight,
  Truck,
  CreditCard,
  ChevronDown,
  StickyNote,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatGuaranies } from '@/lib/utils';
import { useSettings } from '@/contexts/SettingsContext';
import { ServiceCard } from '@/components/storefront/ServiceCard';
import { CartSheet, type CartLine } from '@/components/storefront/CartSheet';
import { buildStatusNotificationMessage, buildWhatsAppLink } from '@/lib/storefront';
import {
  ORDER_STATUS_LABELS,
  type Contact,
  type Order,
  type OrderDeliveryType,
  type OrderItem,
  type OrderPaymentMethod,
  type OrderStatus,
  type Service,
} from '@/types';

const STATUS_OPTIONS: OrderStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

const ERROR_COPY: Record<string, string> = {
  VC400: 'Revisá los datos ingresados.',
  VC403: 'No tenés permisos para editar este pedido.',
  VC404: 'Pedido no encontrado.',
  VC409: 'Uno de los servicios ya no está disponible.',
};

function copyForError(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Ocurrió un error. Intentá de nuevo.';
  return ERROR_COPY[error.code ?? ''] ?? 'Ocurrió un error. Intentá de nuevo.';
}

interface EditState {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  note: string;
  paymentMethod: OrderPaymentMethod;
  deliveryType: OrderDeliveryType;
  deliveryAddress: string;
  status: OrderStatus;
  cart: Record<string, number>;
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;
  const { settings } = useSettings();

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const [orderResult, itemsResult] = await Promise.all([
        supabase.from('orders').select('*').eq('id', orderId).single(),
        supabase.from('order_items').select('*').eq('order_id', orderId),
      ]);

      if (orderResult.error || !orderResult.data) {
        setError('Pedido no encontrado');
        setLoading(false);
        return;
      }

      const loadedOrder = orderResult.data as Order;
      setOrder(loadedOrder);
      setItems((itemsResult.data as OrderItem[]) || []);

      if (loadedOrder.contact_id) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('id, full_name, ci, phone, comment, created_at')
          .eq('id', loadedOrder.contact_id)
          .single();
        setContact((contactData as Contact) || null);
      }

      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .eq('is_available', true)
        .or(`branch_id.eq.${loadedOrder.branch_id},branch_id.is.null`)
        .order('name');
      setServices((servicesData as Service[]) || []);

      setLoading(false);
    };

    load();
  }, [orderId]);

  const startEditing = () => {
    if (!order) return;
    const cart: Record<string, number> = {};
    for (const item of items) {
      cart[item.service_id] = item.qty;
    }
    setEdit({
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email || '',
      note: order.note || '',
      paymentMethod: order.payment_method,
      deliveryType: order.delivery_type,
      deliveryAddress: order.delivery_address || '',
      status: order.status,
      cart,
    });
    setSaveError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEdit(null);
    setSaveError(null);
  };

  const editLines: CartLine[] = useMemo(() => {
    if (!edit) return [];
    return services
      .filter((s) => (edit.cart[s.id] ?? 0) > 0)
      .map((s) => ({ service: s, qty: edit.cart[s.id] }));
  }, [edit, services]);

  const editTotal = editLines.reduce((sum, line) => sum + line.service.price * line.qty, 0);

  const addToCart = (service: Service) => {
    setEdit((prev) =>
      prev ? { ...prev, cart: { ...prev.cart, [service.id]: (prev.cart[service.id] ?? 0) + 1 } } : prev
    );
  };

  const increment = (serviceId: string) => {
    setEdit((prev) =>
      prev ? { ...prev, cart: { ...prev.cart, [serviceId]: (prev.cart[serviceId] ?? 0) + 1 } } : prev
    );
  };

  const decrement = (serviceId: string) => {
    setEdit((prev) => {
      if (!prev) return prev;
      const next = { ...prev.cart };
      const qty = (next[serviceId] ?? 0) - 1;
      if (qty <= 0) {
        delete next[serviceId];
      } else {
        next[serviceId] = qty;
      }
      return { ...prev, cart: next };
    });
  };

  const handleSave = async () => {
    if (!edit || !order) return;
    setSaving(true);
    setSaveError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.rpc('update_order', {
      p_order_id: order.id,
      p_customer_name: edit.customerName,
      p_customer_phone: edit.customerPhone,
      p_customer_email: edit.customerEmail || null,
      p_note: edit.note || null,
      p_payment_method: edit.paymentMethod,
      p_delivery_type: edit.deliveryType,
      p_delivery_address: edit.deliveryType === 'delivery' ? edit.deliveryAddress : null,
      p_status: edit.status,
      p_items: editLines.map((line) => ({ service_id: line.service.id, qty: line.qty })),
    });

    setSaving(false);

    if (updateError) {
      setSaveError(copyForError(updateError));
      return;
    }

    const [orderResult, itemsResult] = await Promise.all([
      supabase.from('orders').select('*').eq('id', order.id).single(),
      supabase.from('order_items').select('*').eq('order_id', order.id),
    ]);
    if (orderResult.data) setOrder(orderResult.data as Order);
    setItems((itemsResult.data as OrderItem[]) || []);
    setIsEditing(false);
    setEdit(null);
  };

  const handleStatusChange = async (status: OrderStatus) => {
    if (!order) return;
    const supabase = createClient();
    setOrder({ ...order, status });
    await supabase.from('orders').update({ status }).eq('id', order.id);
  };

  const handleNotify = () => {
    if (!order) return;
    const message = buildStatusNotificationMessage(order, settings.business_name);
    const link = buildWhatsAppLink(order.customer_phone, message);
    window.open(link, '_blank');
  };

  if (loading) {
    return (
      <div className="page">
        <p className="page-subtitle">Cargando...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="page">
        <header className="page-header flex-header">
          <Link href="/orders" className="back-btn">←</Link>
          <h1 className="page-title">Pedido</h1>
        </header>
        <p className="page-subtitle">{error || 'Pedido no encontrado'}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header flex-header">
        <Link href="/orders" className="back-btn">←</Link>
        <h1 className="page-title">{order.order_code}</h1>
        {!isEditing && (
          <button type="button" className="edit-btn" onClick={startEditing}>
            Editar
          </button>
        )}
      </header>

      {isEditing && edit ? (
        <section className="section edit-section">
          <label>
            Nombre
            <input
              value={edit.customerName}
              onChange={(e) => setEdit({ ...edit, customerName: e.target.value })}
            />
          </label>
          <label>
            Teléfono
            <input
              value={edit.customerPhone}
              onChange={(e) => setEdit({ ...edit, customerPhone: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              value={edit.customerEmail}
              onChange={(e) => setEdit({ ...edit, customerEmail: e.target.value })}
            />
          </label>
          <label>
            Método de pago
            <select
              value={edit.paymentMethod}
              onChange={(e) => setEdit({ ...edit, paymentMethod: e.target.value as OrderPaymentMethod })}
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </label>
          <label>
            Entrega
            <select
              value={edit.deliveryType}
              onChange={(e) => setEdit({ ...edit, deliveryType: e.target.value as OrderDeliveryType })}
            >
              <option value="pickup">Retirar en el local</option>
              <option value="delivery">Delivery</option>
            </select>
          </label>
          {edit.deliveryType === 'delivery' && (
            <label>
              Dirección
              <input
                value={edit.deliveryAddress}
                onChange={(e) => setEdit({ ...edit, deliveryAddress: e.target.value })}
              />
            </label>
          )}
          <label>
            Estado
            <select
              value={edit.status}
              onChange={(e) => setEdit({ ...edit, status: e.target.value as OrderStatus })}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <h2 className="section-title">Items</h2>
          <ul className="edit-service-list">
            {services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                qtyInCart={edit.cart[service.id] ?? 0}
                onAdd={addToCart}
              />
            ))}
          </ul>
          <CartSheet
            lines={editLines}
            onIncrement={increment}
            onDecrement={decrement}
            onCheckout={() => {}}
          />
          <p className="edit-total">Nuevo total: {formatGuaranies(editTotal)}</p>

          {saveError && <p role="alert" className="save-error">{saveError}</p>}

          <div className="edit-actions">
            <button type="button" className="cancel-btn" onClick={cancelEditing} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* Status control row */}
          <div className="order-control-row">
            <div className="status-pill-wrap">
              <select
                className={`status-pill status-${order.status}`}
                value={order.status}
                onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
                aria-label="Estado del pedido"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
                ))}
              </select>
              <ChevronDown size={11} className="status-chevron" aria-hidden="true" />
            </div>
            <button type="button" className="whatsapp-btn" onClick={handleNotify}>
              <MessageCircle size={15} />
              Notificar
            </button>
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
                <Link
                  href={`/contacts/${order.contact_id}`}
                  className="contact-pill"
                >
                  <User size={13} />
                  <span>Ver contacto</span>
                  <ChevronRight size={13} />
                </Link>
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
              <strong>{formatGuaranies(order.total)}</strong>
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
      )}

      <style>{`
        .page { max-width: 480px; margin: 0 auto; }

        .flex-header { display: flex; align-items: center; gap: 12px; }
        .back-btn {
          width: 40px; height: 40px; min-height: unset; min-width: unset;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
          background: var(--surface-elevated); border-radius: 8px;
          color: var(--text-primary); text-decoration: none; flex-shrink: 0;
        }
        .edit-btn {
          margin-left: auto; padding: 8px 14px; min-height: unset;
          background: var(--surface-elevated);
          border-radius: 8px; border: 1px solid var(--border);
          color: var(--text-primary); font-size: 13px; font-weight: 600; cursor: pointer;
        }

        /* Status control row */
        .order-control-row {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 20px;
        }
        .status-pill-wrap { position: relative; display: flex; align-items: center; flex-shrink: 0; }
        .status-pill {
          appearance: none; -webkit-appearance: none;
          min-height: unset; min-width: unset;
          padding: 8px 30px 8px 14px;
          border-radius: 20px; font-size: 13px; font-weight: 600;
          cursor: pointer; border: 1px solid transparent; width: auto;
        }
        .status-chevron { position: absolute; right: 10px; pointer-events: none; opacity: 0.7; }

        .status-pill.status-pending  { background: rgba(217,119,6,.14); color: #92400e; border-color: rgba(217,119,6,.28); }
        .status-pill.status-confirmed { background: rgba(37,99,235,.12); color: #1e40af; border-color: rgba(37,99,235,.24); }
        .status-pill.status-completed { background: rgba(22,163,74,.12); color: #166534; border-color: rgba(22,163,74,.24); }
        .status-pill.status-cancelled { background: rgba(107,114,128,.1); color: #6b7280; border-color: rgba(107,114,128,.2); }
        [data-theme='dark'] .status-pill.status-pending  { background: rgba(251,191,36,.15); color: #fbbf24; border-color: rgba(251,191,36,.3); }
        [data-theme='dark'] .status-pill.status-confirmed { background: rgba(96,165,250,.12); color: #60a5fa; border-color: rgba(96,165,250,.25); }
        [data-theme='dark'] .status-pill.status-completed { background: rgba(74,222,128,.12); color: #4ade80; border-color: rgba(74,222,128,.25); }
        [data-theme='dark'] .status-pill.status-cancelled { background: rgba(156,163,175,.1); color: #9ca3af; border-color: rgba(156,163,175,.2); }

        .whatsapp-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 8px 14px; border: none; border-radius: 20px;
          background: #25D366; color: #fff;
          font-size: 13px; font-weight: 600; cursor: pointer;
          min-height: unset;
        }

        /* Detail cards */
        .detail-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden; margin-bottom: 12px;
        }
        .detail-card-label {
          padding: 10px 16px 0;
          font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--text-secondary);
        }
        .detail-card-body { padding: 10px 16px 14px; }

        /* Customer section */
        .customer-name { font-size: 17px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
        .customer-meta {
          display: flex; align-items: center; gap: 7px;
          font-size: 14px; color: var(--text-secondary); margin-bottom: 5px;
        }
        .meta-icon { color: var(--text-secondary); flex-shrink: 0; }
        .contact-pill {
          display: inline-flex; align-items: center; gap: 6px;
          margin-top: 10px; padding: 8px 12px;
          background: var(--surface-elevated); border: 1px solid var(--border);
          border-radius: 8px; text-decoration: none;
          color: var(--text-primary); font-size: 13px; font-weight: 600;
        }
        .contact-pill:hover { border-color: var(--accent); color: var(--accent); }

        /* Items section */
        .items-list { list-style: none; border-top: 1px solid var(--border); }
        .item-row {
          display: flex; justify-content: space-between; align-items: baseline;
          padding: 11px 16px; border-bottom: 1px solid var(--border);
          gap: 12px;
        }
        .item-left { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
        .item-qty { font-size: 13px; color: var(--text-secondary); font-weight: 600; flex-shrink: 0; }
        .item-name { font-size: 14px; color: var(--text-primary); }
        .item-total { font-size: 14px; font-weight: 600; color: var(--text-primary); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .grand-total-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 16px;
          font-size: 15px;
          color: var(--text-secondary);
        }
        .grand-total-row strong { font-size: 17px; font-weight: 700; color: var(--text-primary); }

        /* Delivery & Payment */
        .detail-row-group { display: flex; flex-direction: column; gap: 8px; }
        .detail-info-row {
          display: flex; align-items: center; gap: 9px;
          font-size: 14px; color: var(--text-primary);
        }
        .info-icon { color: var(--text-secondary); flex-shrink: 0; }

        /* Note */
        .order-note {
          display: flex; align-items: flex-start; gap: 9px;
          font-size: 14px; color: var(--text-secondary); line-height: 1.5;
        }

        /* Edit mode */
        .section { margin-bottom: 24px; }
        .section-title {
          font-size: 12px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 12px;
        }
        .edit-section label {
          display: flex; flex-direction: column; gap: 4px;
          font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px;
        }
        .edit-section input, .edit-section select {
          padding: 10px 12px; border: 1px solid var(--border);
          border-radius: 8px; font-size: 15px;
        }
        .edit-service-list {
          list-style: none; display: flex; flex-direction: column;
          gap: 1px; background: var(--border);
        }
        .edit-total { margin-top: 12px; font-weight: 700; }
        .save-error { color: var(--danger, #DC2626); font-size: 14px; }
        .edit-actions { display: flex; gap: 12px; margin-top: 16px; }
        .cancel-btn, .save-btn {
          flex: 1; padding: 14px; border-radius: 8px; border: none;
          font-size: 15px; font-weight: 600; cursor: pointer; min-height: 44px;
        }
        .cancel-btn { background: var(--surface-elevated); color: var(--text-primary); }
        .save-btn { background: var(--accent); color: var(--accent-foreground); }
      `}</style>
    </div>
  );
}
