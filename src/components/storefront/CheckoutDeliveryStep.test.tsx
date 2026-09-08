import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CheckoutDeliveryStep } from './CheckoutDeliveryStep';

// ─── Geolocation mock ────────────────────────────────────────────────────────

type GeoSuccessCallback = (pos: { coords: { latitude: number; longitude: number } }) => void;
type GeoErrorCallback = (err: { code: number; message: string }) => void;

let geoSuccessCb: GeoSuccessCallback | null = null;
let geoErrorCb: GeoErrorCallback | null = null;

const mockGetCurrentPosition = vi.fn((success: GeoSuccessCallback, error: GeoErrorCallback) => {
  geoSuccessCb = success;
  geoErrorCb = error;
});

beforeEach(() => {
  geoSuccessCb = null;
  geoErrorCb = null;
  mockGetCurrentPosition.mockClear();
  Object.defineProperty(globalThis, 'navigator', {
    value: { geolocation: { getCurrentPosition: mockGetCurrentPosition } },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Props helpers ────────────────────────────────────────────────────────────

function makeProps(overrides = {}) {
  return {
    deliveryAddress: '',
    onAddressChange: vi.fn(),
    deliveryLocation: null,
    onLocationCapture: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

// ─── REQ-DELIVERY-1: address input ────────────────────────────────────────────

describe('CheckoutDeliveryStep — address input (REQ-DELIVERY-1)', () => {
  it('renders an address text input', () => {
    render(<CheckoutDeliveryStep {...makeProps()} />);
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('calls onAddressChange when the user types', () => {
    const onAddressChange = vi.fn();
    render(<CheckoutDeliveryStep {...makeProps({ onAddressChange })} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Calle 123' } });
    expect(onAddressChange).toHaveBeenCalledWith('Calle 123');
  });

  it('reflects the controlled deliveryAddress value', () => {
    render(<CheckoutDeliveryStep {...makeProps({ deliveryAddress: 'Av. España 456' })} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Av. España 456');
  });
});

// ─── REQ-DELIVERY-2: GPS capture ──────────────────────────────────────────────

describe('CheckoutDeliveryStep — GPS capture (REQ-DELIVERY-2)', () => {
  it('renders a "Usar mi ubicación" button', () => {
    render(<CheckoutDeliveryStep {...makeProps()} />);
    expect(screen.getByRole('button', { name: /ubicaci[oó]n/i })).toBeTruthy();
  });

  it('calls navigator.geolocation.getCurrentPosition when the GPS button is clicked', () => {
    render(<CheckoutDeliveryStep {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /ubicaci[oó]n/i }));
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('calls onLocationCapture with lat/lng on success', async () => {
    const onLocationCapture = vi.fn();
    render(<CheckoutDeliveryStep {...makeProps({ onLocationCapture })} />);
    fireEvent.click(screen.getByRole('button', { name: /ubicaci[oó]n/i }));

    await act(async () => {
      geoSuccessCb!({ coords: { latitude: -25.2867, longitude: -57.6470 } });
    });

    expect(onLocationCapture).toHaveBeenCalledWith({ lat: -25.2867, lng: -57.6470 });
  });

  it('shows a confirmation message when deliveryLocation is set', () => {
    render(
      <CheckoutDeliveryStep
        {...makeProps({ deliveryLocation: { lat: -25.2867, lng: -57.6470 } })}
      />
    );
    expect(screen.getByTestId('cds-location-confirmed')).toBeTruthy();
  });

  it('does NOT show confirmation when deliveryLocation is null', () => {
    render(<CheckoutDeliveryStep {...makeProps({ deliveryLocation: null })} />);
    expect(screen.queryByTestId('cds-location-confirmed')).toBeNull();
  });

  it('shows an error message when geolocation fails', async () => {
    render(<CheckoutDeliveryStep {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /ubicaci[oó]n/i }));

    await act(async () => {
      geoErrorCb!({ code: 1, message: 'User denied' });
    });

    expect(screen.getByTestId('cds-geo-error')).toBeTruthy();
  });
});

// ─── REQ-DELIVERY-3: navigation ──────────────────────────────────────────────

describe('CheckoutDeliveryStep — navigation (REQ-DELIVERY-3)', () => {
  it('calls onNext when "Continuar" is clicked', () => {
    const onNext = vi.fn();
    render(<CheckoutDeliveryStep {...makeProps({ onNext })} />);
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('calls onBack when "Volver" is clicked', () => {
    const onBack = vi.fn();
    render(<CheckoutDeliveryStep {...makeProps({ onBack })} />);
    fireEvent.click(screen.getByRole('button', { name: /volver/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a delivery fee notice', () => {
    render(<CheckoutDeliveryStep {...makeProps()} />);
    expect(screen.getByTestId('cds-fee-notice')).toBeTruthy();
  });
});
