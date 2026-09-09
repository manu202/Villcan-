import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CheckoutStep } from './CheckoutStep';

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    deliveryType: 'pickup' as const,
    onDeliveryTypeChange: vi.fn(),
    deliveryAddress: '',
    onAddressChange: vi.fn(),
    deliveryLocation: null,
    onLocationCapture: vi.fn(),
    submitting: false,
    errorMessage: null,
    onSubmit: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

// One-screen checkout — this REPLACES the old two-step delivery-data →
// payment flow (see GastronomyTemplate/RetailTemplate). User feedback:
// asking pickup-vs-delivery on its own screen before the actual form was
// unnecessary friction; it belongs inside the same form as everything else.

describe('CheckoutStep — customer fields', () => {
  it('renders name, phone and payment method fields', () => {
    render(<CheckoutStep {...makeProps()} />);
    expect(screen.getByLabelText(/nombre/i)).toBeTruthy();
    expect(screen.getByLabelText(/teléfono/i)).toBeTruthy();
    expect(screen.getByLabelText(/método de pago/i)).toBeTruthy();
  });

  it('calls onBack when the back link is clicked', () => {
    const onBack = vi.fn();
    render(<CheckoutStep {...makeProps({ onBack })} />);
    fireEvent.click(screen.getByRole('button', { name: /volver/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows the submitting state and disables the submit button', () => {
    render(<CheckoutStep {...makeProps({ submitting: true })} />);
    const submit = screen.getByRole('button', { name: /enviando/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('renders the error message when present', () => {
    render(<CheckoutStep {...makeProps({ errorMessage: 'Algo salió mal' })} />);
    expect(screen.getByRole('alert').textContent).toContain('Algo salió mal');
  });
});

describe('CheckoutStep — delivery/pickup selector (in-form, no separate screen)', () => {
  it('renders a Retirar/Delivery toggle by default', () => {
    render(<CheckoutStep {...makeProps()} />);
    expect(screen.getByRole('button', { name: /^retirar$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^delivery$/i })).toBeTruthy();
  });

  it('does not render the toggle or any delivery fields when allowDelivery is false', () => {
    render(<CheckoutStep {...makeProps({ allowDelivery: false })} />);
    expect(screen.queryByRole('button', { name: /^delivery$/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/Mcal\. López/i)).toBeNull();
  });

  it('calls onDeliveryTypeChange when the Delivery pill is tapped', () => {
    const onDeliveryTypeChange = vi.fn();
    render(<CheckoutStep {...makeProps({ onDeliveryTypeChange })} />);
    fireEvent.click(screen.getByRole('button', { name: /^delivery$/i }));
    expect(onDeliveryTypeChange).toHaveBeenCalledWith('delivery');
  });

  it('does not show the address field when deliveryType is pickup', () => {
    render(<CheckoutStep {...makeProps({ deliveryType: 'pickup' })} />);
    expect(screen.queryByPlaceholderText(/Mcal\. López/i)).toBeNull();
    expect(screen.queryByText(/costo de delivery/i)).toBeNull();
  });

  it('shows the address field, locate button, and fee notice when deliveryType is delivery', () => {
    render(<CheckoutStep {...makeProps({ deliveryType: 'delivery' })} />);
    expect(screen.getByPlaceholderText(/Mcal\. López/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /usar mi ubicación/i })).toBeTruthy();
    expect(screen.getByText(/costo de delivery/i)).toBeTruthy();
  });

  it('captures GPS location via the locate button', async () => {
    const onLocationCapture = vi.fn();
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: -25.2867, longitude: -57.647 } })
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    render(<CheckoutStep {...makeProps({ deliveryType: 'delivery', onLocationCapture })} />);
    fireEvent.click(screen.getByRole('button', { name: /usar mi ubicación/i }));

    await waitFor(() =>
      expect(onLocationCapture).toHaveBeenCalledWith({ lat: -25.2867, lng: -57.647 })
    );
    vi.unstubAllGlobals();
  });

  it('shows a confirmation once deliveryLocation is set', () => {
    render(
      <CheckoutStep
        {...makeProps({ deliveryType: 'delivery', deliveryLocation: { lat: 1, lng: 2 } })}
      />
    );
    expect(screen.getByTestId('cks-location-confirmed')).toBeTruthy();
  });
});

describe('CheckoutStep — submit', () => {
  it('submits all values, including the selected deliveryType and address', () => {
    const onSubmit = vi.fn();
    render(
      <CheckoutStep
        {...makeProps({
          deliveryType: 'delivery',
          deliveryAddress: 'Mcal. López 1234',
          onSubmit,
        })}
      />
    );
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '0981111222' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar pedido/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ana',
        phone: '+5950981111222',
        deliveryType: 'delivery',
        deliveryAddress: 'Mcal. López 1234',
        paymentMethod: 'efectivo',
      })
    );
  });

  it('submits deliveryType pickup with an empty address when pickup is selected', () => {
    const onSubmit = vi.fn();
    render(<CheckoutStep {...makeProps({ deliveryType: 'pickup', onSubmit })} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '0981111222' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar pedido/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryType: 'pickup', deliveryAddress: '' })
    );
  });
});
