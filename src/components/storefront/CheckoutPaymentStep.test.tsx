import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CheckoutPaymentStep } from './CheckoutPaymentStep';
import type { CheckoutFormValues } from './CheckoutForm';

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    deliveryType: 'pickup' as const,
    deliveryAddress: '',
    submitting: false,
    errorMessage: null,
    onSubmit: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

function fillAndSubmit(overrides: Record<string, unknown> = {}) {
  const props = makeProps(overrides);
  render(<CheckoutPaymentStep {...props} />);
  fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '0981111222' } });
  fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
  return props;
}

// ─── REQ-PAYMENT-1: customer fields ──────────────────────────────────────────

describe('CheckoutPaymentStep — customer fields (REQ-PAYMENT-1)', () => {
  it('renders a name text input', () => {
    render(<CheckoutPaymentStep {...makeProps()} />);
    expect(screen.getByLabelText(/nombre/i)).toBeTruthy();
  });

  it('renders a phone text input', () => {
    render(<CheckoutPaymentStep {...makeProps()} />);
    expect(screen.getByLabelText(/teléfono/i)).toBeTruthy();
  });

  it('renders an email input', () => {
    render(<CheckoutPaymentStep {...makeProps()} />);
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
  });

  it('renders a note textarea', () => {
    render(<CheckoutPaymentStep {...makeProps()} />);
    expect(screen.getByLabelText(/nota/i)).toBeTruthy();
  });
});

// ─── REQ-PAYMENT-2: payment method ───────────────────────────────────────────

describe('CheckoutPaymentStep — payment method (REQ-PAYMENT-2)', () => {
  it('renders a payment method selector', () => {
    render(<CheckoutPaymentStep {...makeProps()} />);
    expect(screen.getByLabelText(/método de pago/i)).toBeTruthy();
  });

  it('defaults payment method to "efectivo"', () => {
    render(<CheckoutPaymentStep {...makeProps()} />);
    const select = screen.getByLabelText(/método de pago/i) as HTMLSelectElement;
    expect(select.value).toBe('efectivo');
  });

  it('includes "transferencia" as an option', () => {
    render(<CheckoutPaymentStep {...makeProps()} />);
    expect(screen.getByRole('option', { name: /transferencia/i })).toBeTruthy();
  });
});

// ─── REQ-PAYMENT-3: submission ────────────────────────────────────────────────

describe('CheckoutPaymentStep — submission (REQ-PAYMENT-3)', () => {
  it('calls onSubmit with correct CheckoutFormValues on confirm', () => {
    const props = fillAndSubmit({ deliveryType: 'delivery', deliveryAddress: 'Calle 123' });
    const submitted: CheckoutFormValues = props.onSubmit.mock.calls[0][0];
    expect(submitted.name).toBe('Ana');
    expect(submitted.deliveryType).toBe('delivery');
    expect(submitted.deliveryAddress).toBe('Calle 123');
  });

  it('includes phone with country code in submitted values', () => {
    const props = fillAndSubmit();
    const submitted: CheckoutFormValues = props.onSubmit.mock.calls[0][0];
    expect(submitted.phone).toContain('0981111222');
  });

  it('shows error message when errorMessage prop is set', () => {
    render(<CheckoutPaymentStep {...makeProps({ errorMessage: 'Error de red' })} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Error de red');
  });

  it('disables confirm button while submitting', () => {
    render(<CheckoutPaymentStep {...makeProps({ submitting: true })} />);
    const btn = screen.getByRole('button', { name: /enviando/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onBack when "Volver" is clicked', () => {
    const onBack = vi.fn();
    render(<CheckoutPaymentStep {...makeProps({ onBack })} />);
    fireEvent.click(screen.getByRole('button', { name: /volver/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
