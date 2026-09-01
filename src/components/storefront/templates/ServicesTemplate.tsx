'use client';

import { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { CheckoutForm } from '../CheckoutForm';
import { OrderSuccess } from '../OrderSuccess';
import { useStorefrontCart } from '../useStorefrontCart';
import { formatGuaranies } from '@/lib/utils';
import type { Branch, Service } from '@/types';

interface ServicesTemplateProps {
  branch: Branch;
  services: Service[];
}

/**
 * Services vertical (barbershop + generic fallback) — editorial, minimalist
 * identity distinct from both gastronomy and retail: warm off-white/black
 * palette, serif headings, a simple numbered list of services (name,
 * description, price — no invented duration field), and a slide-up cart
 * panel.
 */
export function ServicesTemplate({ branch, services }: ServicesTemplateProps) {
  const {
    cart,
    lines,
    total,
    itemCount,
    step,
    submitting,
    errorMessage,
    result,
    whatsappHref,
    addToCart,
    increment,
    decrement,
    goToCheckout,
    backToCatalog,
    handleSubmit,
  } = useStorefrontCart(branch, services);

  const [cartOpen, setCartOpen] = useState(false);

  if (step === 'success' && result && whatsappHref) {
    return (
      <div className="svc-shell">
        <OrderSuccess orderCode={result.order_code} whatsappHref={whatsappHref} />
        <ServicesStyles />
      </div>
    );
  }

  if (step === 'checkout') {
    return (
      <div className="svc-shell">
        <CheckoutForm
          submitting={submitting}
          errorMessage={errorMessage}
          onSubmit={handleSubmit}
          onBack={backToCatalog}
        />
        <ServicesStyles />
      </div>
    );
  }

  return (
    <div className="svc-shell">
      <header className="svc-header">
        <span className="svc-eyebrow">Reservá tu turno</span>
        <h1>{branch.name}</h1>
      </header>

      <ul className="svc-list">
        {services.map((service, idx) => {
          const qty = cart[service.id] ?? 0;
          return (
            <li className="svc-item" key={service.id}>
              <span className="svc-item-index">{String(idx + 1).padStart(2, '0')}</span>
              <div className="svc-item-body">
                <span className="svc-item-name">{service.name}</span>
                {service.description && (
                  <span className="svc-item-desc">{service.description}</span>
                )}
              </div>
              <div className="svc-item-right">
                <span className="svc-item-price">{formatGuaranies(service.price)}</span>
                <button
                  type="button"
                  className="svc-add-btn"
                  onClick={() => addToCart(service)}
                >
                  {qty > 0 ? `Agregado (${qty})` : 'Agregar'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {itemCount > 0 && (
        <button type="button" className="svc-fab" onClick={() => setCartOpen(true)}>
          Ver selección ({itemCount}) — {formatGuaranies(total)}
        </button>
      )}

      <div
        className={`svc-overlay ${cartOpen ? 'open' : ''}`}
        onClick={() => setCartOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`svc-panel ${cartOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Tu selección"
      >
        <div className="svc-panel-head">
          <h3>Tu selección</h3>
          <button type="button" aria-label="Cerrar" onClick={() => setCartOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="svc-panel-body">
          {lines.length === 0 ? (
            <div className="svc-empty">Todavía no elegiste servicios.</div>
          ) : (
            lines.map((line) => (
              <div className="svc-panel-item" key={line.service.id}>
                <div>
                  <div className="svc-panel-item-name">{line.service.name}</div>
                  <div className="svc-panel-item-price">
                    {formatGuaranies(line.service.price)} c/u
                  </div>
                </div>
                <div className="svc-qty-ctrl">
                  <button
                    type="button"
                    aria-label={`Restar ${line.service.name}`}
                    onClick={() => decrement(line.service.id)}
                  >
                    <Minus size={14} />
                  </button>
                  <span>{line.qty}</span>
                  <button
                    type="button"
                    aria-label={`Sumar ${line.service.name}`}
                    onClick={() => increment(line.service.id)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="svc-panel-foot">
          <div className="svc-total-row">
            <span>Total</span>
            <strong>{formatGuaranies(total)}</strong>
          </div>
          <button
            type="button"
            className="svc-checkout-btn"
            disabled={lines.length === 0}
            onClick={() => {
              setCartOpen(false);
              goToCheckout();
            }}
          >
            Confirmar selección
          </button>
        </div>
      </div>

      <ServicesStyles />
    </div>
  );
}

function ServicesStyles() {
  return (
    <style>{`
      .svc-shell {
        --svc-bg: #f7f4ef;
        --svc-surface: #fffdfa;
        --svc-border: #e2dbcf;
        --svc-ink: #1c1a17;
        --svc-muted: #7a7267;
        --svc-accent: #1c1a17;
        --svc-accent-foreground: #f7f4ef;
        --font-serif: Georgia, 'Iowan Old Style', 'Palatino Linotype', serif;
        min-height: 100vh;
        background: var(--svc-bg);
        color: var(--svc-ink);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        padding-bottom: 90px;
      }
      .svc-header {
        padding: 44px 24px 28px;
        text-align: center;
        border-bottom: 1px solid var(--svc-border);
      }
      .svc-eyebrow {
        display: block;
        font-size: 11px;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: var(--svc-muted);
        margin-bottom: 10px;
      }
      .svc-header h1 {
        font-family: var(--font-serif);
        font-weight: 400;
        font-size: clamp(28px, 7vw, 42px);
        margin: 0;
      }
      .svc-list {
        list-style: none;
        margin: 0;
        padding: 0 20px;
        max-width: 640px;
        margin-inline: auto;
      }
      .svc-item {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 14px;
        align-items: start;
        padding: 22px 4px;
        border-bottom: 1px solid var(--svc-border);
      }
      .svc-item-index {
        font-family: var(--font-serif);
        font-size: 13px;
        color: var(--svc-muted);
        padding-top: 3px;
      }
      .svc-item-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .svc-item-name {
        font-family: var(--font-serif);
        font-size: 18px;
      }
      .svc-item-desc {
        font-size: 12.5px;
        color: var(--svc-muted);
        line-height: 1.5;
      }
      .svc-item-right {
        text-align: right;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }
      .svc-item-price {
        font-size: 14px;
        color: var(--svc-ink);
        font-variant-numeric: tabular-nums;
      }
      .svc-add-btn {
        padding: 8px 14px;
        border: 1px solid var(--svc-ink);
        background: transparent;
        color: var(--svc-ink);
        border-radius: 100px;
        font-size: 11.5px;
        letter-spacing: 0.5px;
        cursor: pointer;
        white-space: nowrap;
        min-height: 34px;
      }
      .svc-fab {
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        z-index: 60;
        background: var(--svc-accent);
        color: var(--svc-accent-foreground);
        border: none;
        border-radius: 100px;
        padding: 15px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .svc-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.4);
        z-index: 90;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s;
      }
      .svc-overlay.open { opacity: 1; pointer-events: auto; }
      .svc-panel {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 91;
        max-height: 80vh;
        background: var(--svc-surface);
        border-top: 1px solid var(--svc-border);
        border-radius: 20px 20px 0 0;
        transform: translateY(100%);
        transition: transform 0.3s ease;
        display: flex;
        flex-direction: column;
      }
      .svc-panel.open { transform: translateY(0); }
      .svc-panel-head {
        padding: 20px;
        border-bottom: 1px solid var(--svc-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .svc-panel-head h3 {
        font-family: var(--font-serif);
        font-size: 18px;
        margin: 0;
        font-weight: 400;
      }
      .svc-panel-head button {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--svc-ink);
      }
      .svc-panel-body { flex: 1; overflow-y: auto; padding: 6px 20px; }
      .svc-empty {
        color: var(--svc-muted);
        font-size: 13px;
        padding: 30px 0;
        text-align: center;
      }
      .svc-panel-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 0;
        border-bottom: 1px solid var(--svc-border);
        gap: 10px;
      }
      .svc-panel-item-name { font-size: 14px; }
      .svc-panel-item-price { font-size: 12px; color: var(--svc-muted); margin-top: 2px; }
      .svc-qty-ctrl { display: flex; align-items: center; gap: 10px; }
      .svc-qty-ctrl button {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 1px solid var(--svc-border);
        background: var(--svc-bg);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .svc-panel-foot { padding: 16px 20px 28px; border-top: 1px solid var(--svc-border); }
      .svc-total-row {
        display: flex;
        justify-content: space-between;
        font-size: 14px;
        margin-bottom: 14px;
      }
      .svc-total-row strong { font-size: 17px; }
      .svc-checkout-btn {
        width: 100%;
        padding: 14px;
        background: var(--svc-accent);
        color: var(--svc-accent-foreground);
        border: none;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        min-height: 44px;
      }
      .svc-checkout-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    `}</style>
  );
}
