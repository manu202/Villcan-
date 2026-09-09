'use client';

import { useState, type FormEvent } from 'react';
import { MapPin, Locate, CheckCircle } from 'lucide-react';
import { PHONE_COUNTRY_OPTIONS, type OrderDeliveryType, type OrderPaymentMethod } from '@/types';
import type { CheckoutFormValues } from './CheckoutForm';

interface CheckoutStepProps {
  deliveryType: OrderDeliveryType;
  onDeliveryTypeChange: (type: OrderDeliveryType) => void;
  deliveryAddress: string;
  onAddressChange: (address: string) => void;
  deliveryLocation: { lat: number; lng: number } | null;
  onLocationCapture: (location: { lat: number; lng: number } | null) => void;
  /** false for verticals with no delivery concept (e.g. a barbershop) — hides
   * the toggle and delivery fields entirely, always submitting 'pickup'. */
  allowDelivery?: boolean;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: CheckoutFormValues) => void;
  onBack: () => void;
}

const DEFAULT_COUNTRY_CODE = '+595';

/**
 * The whole "confirm your order" flow in one screen: name, phone,
 * pickup/delivery, payment method, and — only when delivery is picked —
 * the address/GPS field and fee notice, inline in the same form.
 *
 * Replaces the old two-step flow (CheckoutDeliveryStep → CheckoutPaymentStep)
 * per direct user feedback: asking pickup-vs-delivery on its own screen
 * before the actual form was unnecessary friction — see SDD "Storefront
 * Mobile App-Like" and GastronomyTemplate/RetailTemplate's checkout wizard.
 */
export function CheckoutStep({
  deliveryType,
  onDeliveryTypeChange,
  deliveryAddress,
  onAddressChange,
  deliveryLocation,
  onLocationCapture,
  allowDelivery = true,
  submitting,
  errorMessage,
  onSubmit,
  onBack,
}: CheckoutStepProps) {
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('efectivo');
  const [note, setNote] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const showDelivery = allowDelivery && deliveryType === 'delivery';

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setGeoError('Tu dispositivo no soporta geolocalización.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onLocationCapture({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setGeoError('No se pudo obtener tu ubicación. Ingresá la dirección manualmente.');
      },
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      phone: `${countryCode}${phone}`,
      email,
      note,
      paymentMethod,
      deliveryType,
      deliveryAddress,
    });
  };

  return (
    <form className="cks-form" onSubmit={handleSubmit}>
      <button type="button" className="cks-back" onClick={onBack}>
        ← Volver
      </button>

      <h2 className="cks-title">Tus datos</h2>

      <label className="cks-label" htmlFor="cks-name">
        Nombre*
        <input
          id="cks-name"
          className="cks-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
        />
      </label>

      <div className="cks-phone-row">
        <label className="cks-label cks-country-label" htmlFor="cks-country">
          País
          <select
            id="cks-country"
            className="cks-input"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
          >
            {PHONE_COUNTRY_OPTIONS.map((opt) => (
              <option key={opt.iso} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="cks-label cks-phone-label" htmlFor="cks-phone">
          Teléfono*
          <input
            id="cks-phone"
            className="cks-input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
      </div>

      {allowDelivery && (
        <div className="cks-label">
          Entrega
          <div className="cks-toggle" role="group" aria-label="Tipo de entrega">
            <button
              type="button"
              className={`cks-toggle-btn${deliveryType === 'pickup' ? ' is-active' : ''}`}
              onClick={() => onDeliveryTypeChange('pickup')}
            >
              Retirar
            </button>
            <button
              type="button"
              className={`cks-toggle-btn${deliveryType === 'delivery' ? ' is-active' : ''}`}
              onClick={() => onDeliveryTypeChange('delivery')}
            >
              Delivery
            </button>
          </div>
        </div>
      )}

      {showDelivery && (
        <div className="cks-delivery-fields">
          <label className="cks-label" htmlFor="cks-address">
            Dirección
            <input
              id="cks-address"
              type="text"
              className="cks-input"
              value={deliveryAddress}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Ej: Mcal. López 1234, Asunción"
            />
          </label>

          <div className="cks-divider">o</div>

          <button
            type="button"
            className="cks-locate-btn"
            onClick={handleLocate}
            disabled={locating}
          >
            <Locate size={16} aria-hidden="true" />
            {locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación'}
          </button>

          {deliveryLocation && (
            <div className="cks-location-confirmed" data-testid="cks-location-confirmed">
              <CheckCircle size={15} aria-hidden="true" />
              Ubicación compartida correctamente
            </div>
          )}

          {geoError && (
            <p className="cks-geo-error" data-testid="cks-geo-error" role="alert">
              {geoError}
            </p>
          )}

          <div className="cks-fee-notice" data-testid="cks-fee-notice">
            <MapPin size={14} aria-hidden="true" />
            Costo de delivery <strong>a confirmar</strong> por el local una vez recibido tu pedido.
          </div>
        </div>
      )}

      <label className="cks-label" htmlFor="cks-payment">
        Método de pago
        <select
          id="cks-payment"
          className="cks-input"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as OrderPaymentMethod)}
        >
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
        </select>
      </label>

      <label className="cks-label" htmlFor="cks-email">
        Email (opcional)
        <input
          id="cks-email"
          className="cks-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="cks-label" htmlFor="cks-note">
        Nota
        <textarea
          id="cks-note"
          className="cks-input cks-textarea"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {errorMessage && (
        <p className="cks-error" role="alert">
          {errorMessage}
        </p>
      )}

      <button type="submit" className="cks-submit" disabled={submitting}>
        {submitting ? 'Enviando...' : 'Confirmar pedido'}
      </button>

      <style>{`
        .cks-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 4px 0 8px;
        }
        .cks-back {
          align-self: flex-start;
          background: none;
          border: none;
          color: var(--text-secondary, #6b7280);
          font-size: 14px;
          cursor: pointer;
          padding: 0;
        }
        .cks-title {
          font-size: 20px;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary, #111827);
        }
        .cks-label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
        }
        .cks-input {
          padding: 11px 13px;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 10px;
          font-size: 15px;
          color: var(--text-primary, #111827);
          background: var(--surface, #fff);
          width: 100%;
          box-sizing: border-box;
        }
        .cks-textarea { resize: none; }
        .cks-phone-row { display: flex; gap: 8px; }
        .cks-country-label { flex: 0 0 44%; }
        .cks-phone-label { flex: 1; }
        .cks-toggle {
          display: flex;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 10px;
          overflow: hidden;
        }
        .cks-toggle-btn {
          flex: 1;
          padding: 11px;
          min-height: 48px;
          font-size: 14px;
          font-weight: 600;
          background: var(--surface, #fff);
          color: var(--text-secondary, #6b7280);
          border: none;
          cursor: pointer;
        }
        .cks-toggle-btn.is-active {
          background: var(--accent, #2563eb);
          color: var(--accent-foreground, #fff);
        }
        .cks-delivery-fields {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 14px;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 12px;
          background: var(--surface-elevated, var(--surface, #f9fafb));
        }
        .cks-divider {
          text-align: center;
          font-size: 12px;
          color: var(--text-secondary, #6b7280);
          position: relative;
        }
        .cks-divider::before,
        .cks-divider::after {
          content: '';
          position: absolute;
          top: 50%;
          width: 42%;
          height: 1px;
          background: var(--border, #e5e7eb);
        }
        .cks-divider::before { left: 0; }
        .cks-divider::after { right: 0; }
        .cks-locate-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 13px;
          border: 1.5px solid var(--accent, #2563eb);
          border-radius: 10px;
          background: transparent;
          color: var(--accent, #2563eb);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          min-height: 48px;
          transition: background .2s;
        }
        .cks-locate-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent, #2563eb) 8%, transparent);
        }
        .cks-locate-btn:disabled { opacity: .5; cursor: not-allowed; }
        .cks-location-confirmed {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #16a34a;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          padding: 10px 14px;
        }
        .cks-geo-error {
          font-size: 13px;
          color: #dc2626;
          margin: 0;
        }
        .cks-fee-notice {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12.5px;
          color: var(--text-secondary, #6b7280);
          line-height: 1.5;
        }
        .cks-fee-notice svg { flex-shrink: 0; margin-top: 2px; color: var(--accent, #2563eb); }
        .cks-error {
          color: #dc2626;
          font-size: 13px;
          margin: 0;
        }
        .cks-submit {
          width: 100%;
          padding: 15px;
          background: var(--accent, #2563eb);
          color: var(--accent-foreground, #fff);
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          min-height: 52px;
          margin-top: 4px;
        }
        .cks-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .cks-submit:not(:disabled):hover { opacity: 0.9; }
      `}</style>
    </form>
  );
}
