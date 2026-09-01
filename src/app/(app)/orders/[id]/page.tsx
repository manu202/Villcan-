'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
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

    // Refresh from the server so the view reflects the recalculated total.
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
          <section className="section">
            <h2 className="section-title">Cliente</h2>
            <p>{order.customer_name}</p>
            <p>{order.customer_phone}</p>
            {order.customer_email && <p>{order.customer_email}</p>}
            {order.contact_id ? (
              <Link href={`/contacts/${order.contact_id}`} className="contact-link">
                {contact ? `Ver contacto vinculado: ${contact.full_name} →` : 'Ver contacto vinculado →'}
              </Link>
            ) : (
              <p className="no-contact">Sin contacto vinculado</p>
            )}
          </section>

          <section className="section">
            <h2 className="section-title">Pago y entrega</h2>
            <p>Pago: {order.payment_method === 'efectivo' ? 'Efectivo' : 'Transferencia'}</p>
            <p>
              Entrega:{' '}
              {order.delivery_type === 'delivery'
                ? `Delivery — ${order.delivery_address ?? ''}`
                : 'Retiro en el local'}
            </p>
          </section>

          <section className="section">
            <h2 className="section-title">Items</h2>
            <ul className="order-item-list">
              {items.map((item) => (
                <li key={item.id} className="order-item-row">
                  <span>
                    {item.qty}x {item.name_snapshot}
                  </span>
                  <span>{formatGuaranies(item.line_total)}</span>
                </li>
              ))}
            </ul>
            <p className="order-total-row">Total: {formatGuaranies(order.total)}</p>
          </section>

          <section className="section">
            <h2 className="section-title">Estado</h2>
            <select
              value={order.status}
              onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <button type="button" className="notify-customer-btn" onClick={handleNotify}>
              <MessageCircle size={20} />
              Notificar cliente
            </button>
          </section>
        </>
      )}

      <style>{`
        .page {
          max-width: 480px;
          margin: 0 auto;
        }
        .flex-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .back-btn {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          background: var(--surface-elevated);
          border-radius: 8px;
          color: var(--text-primary);
          text-decoration: none;
        }
        .edit-btn {
          margin-left: auto;
          padding: 8px 16px;
          background: var(--surface-elevated);
          border-radius: 8px;
          border: none;
          color: var(--text-primary);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .section {
          margin-bottom: 24px;
        }
        .section-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 12px;
        }
        .contact-link {
          color: var(--accent);
          font-size: 14px;
        }
        .no-contact {
          color: var(--text-secondary);
          font-size: 14px;
        }
        .order-item-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .order-item-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }
        .order-total-row {
          margin-top: 12px;
          font-weight: 700;
        }
        .edit-section label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 12px;
        }
        .edit-section input, .edit-section select {
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 15px;
        }
        .edit-service-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: var(--border);
        }
        .edit-total {
          margin-top: 12px;
          font-weight: 700;
        }
        .save-error {
          color: var(--danger, #DC2626);
          font-size: 14px;
        }
        .edit-actions {
          display: flex;
          gap: 12px;
          margin-top: 16px;
        }
        .cancel-btn, .save-btn {
          flex: 1;
          padding: 14px;
          border-radius: 8px;
          border: none;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          min-height: 44px;
        }
        .cancel-btn {
          background: var(--surface-elevated);
          color: var(--text-primary);
        }
        .save-btn {
          background: var(--accent);
          color: var(--accent-foreground);
        }
        .notify-customer-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          margin-top: 12px;
          padding: 14px;
          border: none;
          border-radius: 8px;
          background: #25D366;
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          min-height: 44px;
        }
      `}</style>
    </div>
  );
}
