import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CheckoutForm } from './CheckoutForm';

describe('CheckoutForm (REQ: country selector + payment + delivery)', () => {
  it('defaults the country selector to Paraguay (+595)', () => {
    render(<CheckoutForm submitting={false} errorMessage={null} onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect((screen.getByLabelText(/país/i) as HTMLSelectElement).value).toBe('+595');
  });

  it('does not show the delivery address field for pickup (default)', () => {
    render(<CheckoutForm submitting={false} errorMessage={null} onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect(screen.queryByLabelText(/dirección de entrega/i)).toBeNull();
  });

  it('shows the delivery address field only when delivery is selected', () => {
    render(<CheckoutForm submitting={false} errorMessage={null} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/entrega/i), { target: { value: 'delivery' } });
    expect(screen.getByLabelText(/dirección de entrega/i)).toBeTruthy();
  });

  it('submits name/phone (with country code prefix)/payment/delivery values', () => {
    const onSubmit = vi.fn();
    render(<CheckoutForm submitting={false} errorMessage={null} onSubmit={onSubmit} onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Juan Pérez' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '981123456' } });
    fireEvent.change(screen.getByLabelText(/país/i), { target: { value: '+54' } });
    fireEvent.change(screen.getByLabelText(/método de pago/i), { target: { value: 'transferencia' } });
    fireEvent.change(screen.getByLabelText(/entrega/i), { target: { value: 'delivery' } });
    fireEvent.change(screen.getByLabelText(/dirección de entrega/i), { target: { value: 'Calle 123' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar pedido/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Juan Pérez',
        phone: '+54981123456',
        paymentMethod: 'transferencia',
        deliveryType: 'delivery',
        deliveryAddress: 'Calle 123',
      })
    );
  });

  // QA-2 (2026-09-22 prod bug): a customer naturally types their local
  // Paraguayan number with the leading trunk 0 (e.g. "0987654321" — how
  // everyone actually writes/reads it locally), and the naive
  // `${countryCode}${phone}` concatenation kept that 0, producing an
  // invalid, one-digit-too-long number (+5950987654321 instead of
  // +595987654321). Confirmed live via a real storefront order and via
  // /orders/new (this same form, shared with the staff-facing manual-order
  // screen) landing in production's orders.customer_phone and
  // contacts.phone. This must strip exactly one leading local trunk 0
  // before prepending the selected country code.
  it('strips a local leading 0 before prepending the country code', () => {
    const onSubmit = vi.fn();
    render(<CheckoutForm submitting={false} errorMessage={null} onSubmit={onSubmit} onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Cliente Paraguay' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '0987654321' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar pedido/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+595987654321' })
    );
  });

  // QA-4 (2026-09-22): this form is now staff-only (/orders/new — its other
  // consumer, StorefrontClient, is dead code, nothing imports it), and
  // create_manual_order accepts 'pos' fine — the form just never offered
  // it, same gap class the OrderEditForm.tsx fix (SW-M1) already closed
  // elsewhere.
  it('offers POS as a payment method option (staff-only form)', () => {
    render(<CheckoutForm submitting={false} errorMessage={null} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const select = screen.getByLabelText(/método de pago/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain('pos');
  });
});
