'use client';

import { ServiceCard } from '@/components/storefront/ServiceCard';
import { CartSheet, type CartLine } from '@/components/storefront/CartSheet';
import { formatGuaranies } from '@/lib/utils';
import {
  ORDER_STATUS_LABELS,
  type OrderDeliveryType,
  type OrderStatus,
  type PaymentMethod,
  type Service,
} from '@/types';

const STATUS_OPTIONS: OrderStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

export interface EditState {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  note: string;
  // SW-M1: staff can set 'pos' too (this is the staff-facing edit form —
  // the customer-facing storefront checkout stays on the narrower
  // OrderPaymentMethod, which never offers it).
  paymentMethod: PaymentMethod;
  deliveryType: OrderDeliveryType;
  deliveryAddress: string;
  status: OrderStatus;
  cart: Record<string, number>;
}

interface OrderEditFormProps {
  edit: EditState;
  onEditChange: (edit: EditState) => void;
  services: Service[];
  editLines: CartLine[];
  editTotal: number;
  onAddToCart: (service: Service) => void;
  onIncrement: (serviceId: string) => void;
  onDecrement: (serviceId: string) => void;
  saveError: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function OrderEditForm({
  edit,
  onEditChange,
  services,
  editLines,
  editTotal,
  onAddToCart,
  onIncrement,
  onDecrement,
  saveError,
  saving,
  onCancel,
  onSave,
}: OrderEditFormProps) {
  return (
    <section className="section edit-section">
      <label>
        Nombre
        <input
          value={edit.customerName}
          onChange={(e) => onEditChange({ ...edit, customerName: e.target.value })}
        />
      </label>
      <label>
        Teléfono
        <input
          value={edit.customerPhone}
          onChange={(e) => onEditChange({ ...edit, customerPhone: e.target.value })}
        />
      </label>
      <label>
        Email
        <input
          value={edit.customerEmail}
          onChange={(e) => onEditChange({ ...edit, customerEmail: e.target.value })}
        />
      </label>
      <label>
        Método de pago
        <select
          value={edit.paymentMethod}
          onChange={(e) => onEditChange({ ...edit, paymentMethod: e.target.value as PaymentMethod })}
        >
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="pos">POS</option>
        </select>
      </label>
      <label>
        Entrega
        <select
          value={edit.deliveryType}
          onChange={(e) => onEditChange({ ...edit, deliveryType: e.target.value as OrderDeliveryType })}
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
            onChange={(e) => onEditChange({ ...edit, deliveryAddress: e.target.value })}
          />
        </label>
      )}
      <label>
        Estado
        <select
          value={edit.status}
          onChange={(e) => onEditChange({ ...edit, status: e.target.value as OrderStatus })}
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
            onAdd={onAddToCart}
          />
        ))}
      </ul>
      <CartSheet
        lines={editLines}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
        onCheckout={() => {}}
      />
      <p className="edit-total">Nuevo total: {formatGuaranies(editTotal)}</p>

      {saveError && <p role="alert" className="save-error">{saveError}</p>}

      <div className="edit-actions">
        <button type="button" className="cancel-btn" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="button" className="save-btn" onClick={onSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </section>
  );
}
