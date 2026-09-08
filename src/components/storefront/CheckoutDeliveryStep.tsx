'use client';

import { useState } from 'react';
import { MapPin, Locate, CheckCircle } from 'lucide-react';

interface CheckoutDeliveryStepProps {
  deliveryAddress: string;
  onAddressChange: (address: string) => void;
  deliveryLocation: { lat: number; lng: number } | null;
  onLocationCapture: (location: { lat: number; lng: number } | null) => void;
  onNext: () => void;
  onBack: () => void;
}

export function CheckoutDeliveryStep({
  deliveryAddress,
  onAddressChange,
  deliveryLocation,
  onLocationCapture,
  onNext,
  onBack,
}: CheckoutDeliveryStepProps) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

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

  return (
    <div className="cds-wrap">
      <button type="button" className="cds-back" onClick={onBack}>
        ← Volver
      </button>

      <h2 className="cds-title">Dirección de entrega</h2>

      <label className="cds-label">
        Dirección
        <input
          type="text"
          className="cds-input"
          value={deliveryAddress}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="Ej: Mcal. López 1234, Asunción"
        />
      </label>

      <div className="cds-divider">o</div>

      <button
        type="button"
        className="cds-locate-btn"
        onClick={handleLocate}
        disabled={locating}
        aria-label="Compartir mi ubicación"
      >
        <Locate size={16} aria-hidden="true" />
        {locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación'}
      </button>

      {deliveryLocation && (
        <div className="cds-location-confirmed" data-testid="cds-location-confirmed">
          <CheckCircle size={15} aria-hidden="true" />
          Ubicación compartida correctamente
        </div>
      )}

      {geoError && (
        <p className="cds-geo-error" data-testid="cds-geo-error" role="alert">
          {geoError}
        </p>
      )}

      <div className="cds-fee-notice" data-testid="cds-fee-notice">
        <MapPin size={14} aria-hidden="true" />
        El costo de delivery es <strong>a confirmar</strong> por el local una vez recibido tu pedido.
      </div>

      <button type="button" className="cds-next-btn" onClick={onNext}>
        Continuar
      </button>

      <style>{`
        .cds-wrap {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 24px 20px;
        }
        .cds-back {
          align-self: flex-start;
          background: none;
          border: none;
          color: var(--text-secondary, #6b7280);
          font-size: 14px;
          cursor: pointer;
          padding: 0;
        }
        .cds-title {
          font-size: 20px;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary, #111827);
        }
        .cds-label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
        }
        .cds-input {
          padding: 12px 14px;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 10px;
          font-size: 15px;
          color: var(--text-primary, #111827);
          background: var(--surface, #fff);
          width: 100%;
          box-sizing: border-box;
        }
        .cds-divider {
          text-align: center;
          font-size: 12px;
          color: var(--text-secondary, #6b7280);
          position: relative;
        }
        .cds-divider::before,
        .cds-divider::after {
          content: '';
          position: absolute;
          top: 50%;
          width: 42%;
          height: 1px;
          background: var(--border, #e5e7eb);
        }
        .cds-divider::before { left: 0; }
        .cds-divider::after { right: 0; }
        .cds-locate-btn {
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
        .cds-locate-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent, #2563eb) 8%, transparent);
        }
        .cds-locate-btn:disabled { opacity: .5; cursor: not-allowed; }
        .cds-location-confirmed {
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
        .cds-geo-error {
          font-size: 13px;
          color: #dc2626;
          margin: 0;
        }
        .cds-fee-notice {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
          background: var(--surface-elevated, #f9fafb);
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 10px;
          padding: 12px 14px;
          line-height: 1.5;
        }
        .cds-fee-notice svg { flex-shrink: 0; margin-top: 2px; }
        .cds-next-btn {
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
        .cds-next-btn:hover { opacity: .9; }
      `}</style>
    </div>
  );
}
