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
});
