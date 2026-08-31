'use client';

import { useState, type FormEvent } from 'react';

export interface CheckoutFormValues {
  name: string;
  phone: string;
  email: string;
  note: string;
}

interface CheckoutFormProps {
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: CheckoutFormValues) => void;
  onBack: () => void;
}

export function CheckoutForm({ submitting, errorMessage, onSubmit, onBack }: CheckoutFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ name, phone, email, note });
  };

  return (
    <form className="checkout-form" onSubmit={handleSubmit}>
      <button type="button" className="checkout-back-btn" onClick={onBack}>
        ← Volver al carrito
      </button>

      <label>
        Nombre*
        <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </label>
      <label>
        Teléfono*
        <input value={phone} onChange={(e) => setPhone(e.target.value)} required type="tel" />
      </label>
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
      </label>
      <label>
        Nota
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </label>

      {errorMessage && <p role="alert" className="checkout-error">{errorMessage}</p>}

      <button type="submit" className="checkout-submit-btn" disabled={submitting}>
        {submitting ? 'Enviando...' : 'Confirmar pedido'}
      </button>

      <style>{`
        .checkout-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 20px;
        }
        .checkout-back-btn {
          align-self: flex-start;
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 14px;
          cursor: pointer;
          padding: 0;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        input, textarea {
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 15px;
          font-weight: 400;
          color: var(--text-primary);
          background: var(--surface);
        }
        .checkout-error {
          color: var(--danger, #DC2626);
          font-size: 14px;
        }
        .checkout-submit-btn {
          padding: 14px;
          background: var(--accent);
          color: var(--accent-foreground);
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          min-height: 44px;
        }
        .checkout-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </form>
  );
}
