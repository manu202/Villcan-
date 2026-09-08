'use client';

import { useState, type FormEvent } from 'react';
import { PHONE_COUNTRY_OPTIONS, type OrderDeliveryType, type OrderPaymentMethod } from '@/types';
import type { CheckoutFormValues } from './CheckoutForm';

interface CheckoutPaymentStepProps {
  deliveryType: OrderDeliveryType;
  deliveryAddress: string;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: CheckoutFormValues) => void;
  onBack: () => void;
}

const DEFAULT_COUNTRY_CODE = '+595';

export function CheckoutPaymentStep({
  deliveryType,
  deliveryAddress,
  submitting,
  errorMessage,
  onSubmit,
  onBack,
}: CheckoutPaymentStepProps) {
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('efectivo');
  const [note, setNote] = useState('');

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
    <form className="cps-form" onSubmit={handleSubmit}>
      <button type="button" className="cps-back" onClick={onBack}>
        ← Volver
      </button>

      <h2 className="cps-title">Tus datos</h2>

      <label className="cps-label" htmlFor="cps-name">
        Nombre*
        <input
          id="cps-name"
          className="cps-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
        />
      </label>

      <div className="cps-phone-row">
        <label className="cps-label cps-country-label" htmlFor="cps-country">
          País
          <select
            id="cps-country"
            className="cps-input"
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
        <label className="cps-label cps-phone-label" htmlFor="cps-phone">
          Teléfono*
          <input
            id="cps-phone"
            className="cps-input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
      </div>

      <label className="cps-label" htmlFor="cps-email">
        Email
        <input
          id="cps-email"
          className="cps-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="cps-label" htmlFor="cps-payment">
        Método de pago
        <select
          id="cps-payment"
          className="cps-input"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as OrderPaymentMethod)}
        >
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
        </select>
      </label>

      <label className="cps-label" htmlFor="cps-note">
        Nota
        <textarea
          id="cps-note"
          className="cps-input cps-textarea"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {errorMessage && (
        <p className="cps-error" role="alert">
          {errorMessage}
        </p>
      )}

      <button type="submit" className="cps-submit" disabled={submitting}>
        {submitting ? 'Enviando...' : 'Confirmar pedido'}
      </button>

      <style>{`
        .cps-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 24px 20px 32px;
        }
        .cps-back {
          align-self: flex-start;
          background: none;
          border: none;
          color: var(--text-secondary, #6b7280);
          font-size: 14px;
          cursor: pointer;
          padding: 0;
        }
        .cps-title {
          font-size: 20px;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary, #111827);
        }
        .cps-label {
          display: flex;
          flex-direction: column;
          gap: 5px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
        }
        .cps-input {
          padding: 11px 13px;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 10px;
          font-size: 15px;
          color: var(--text-primary, #111827);
          background: var(--surface, #fff);
          width: 100%;
          box-sizing: border-box;
        }
        .cps-textarea { resize: none; }
        .cps-phone-row {
          display: flex;
          gap: 8px;
        }
        .cps-country-label { flex: 0 0 44%; }
        .cps-phone-label { flex: 1; }
        .cps-error {
          color: #dc2626;
          font-size: 13px;
          margin: 0;
        }
        .cps-submit {
          width: 100%;
          padding: 15px;
          background: var(--accent, #2563eb);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          min-height: 52px;
          margin-top: 4px;
        }
        .cps-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .cps-submit:not(:disabled):hover { opacity: 0.9; }
      `}</style>
    </form>
  );
}
