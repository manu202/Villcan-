'use client';

import { useMemo, useState } from 'react';
import { ShoppingCart, X, Plus, Minus, ImageOff } from 'lucide-react';
import { CheckoutForm } from '../CheckoutForm';
import { OrderSuccess } from '../OrderSuccess';
import { useStorefrontCart } from '../useStorefrontCart';
import { formatGuaranies } from '@/lib/utils';
import type { Branch, Service } from '@/types';

interface RetailTemplateProps {
  branch: Branch;
  services: Service[];
}

const ALL = '__all__';

/**
 * Retail vertical — clean, light e-commerce catalog identity distinct from
 * gastronomy: white/neutral background, a single strong accent color, sans
 * typography, product grid with image fallback, category tabs, and a
 * bottom cart bar with counter + total (drawer opens over it).
 */
export function RetailTemplate({ branch, services }: RetailTemplateProps) {
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

  const [activeCategory, setActiveCategory] = useState<string>(ALL);
  const [cartOpen, setCartOpen] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const service of services) {
      if (service.category?.trim()) set.add(service.category.trim());
    }
    return Array.from(set);
  }, [services]);

  const visibleServices = useMemo(
    () =>
      activeCategory === ALL
        ? services
        : services.filter((s) => (s.category?.trim() || '') === activeCategory),
    [services, activeCategory]
  );

  if (step === 'success' && result && whatsappHref) {
    return (
      <div className="retail-shell">
        <header className="retail-header">
          <h1>{branch.name}</h1>
        </header>
        <div className="retail-checkout-page">
          <OrderSuccess orderCode={result.order_code} whatsappHref={whatsappHref} />
        </div>
        <RetailStyles />
      </div>
    );
  }

  if (step === 'checkout') {
    return (
      <div className="retail-shell">
        <header className="retail-header">
          <h1>{branch.name}</h1>
          <button type="button" className="retail-nav-back" onClick={backToCatalog}>← Volver</button>
        </header>
        <div className="retail-checkout-page">
          <div className="retail-checkout-eyebrow">Finalizá tu compra</div>
          <CheckoutForm
            submitting={submitting}
            errorMessage={errorMessage}
            onSubmit={handleSubmit}
            onBack={backToCatalog}
          />
        </div>
        <RetailStyles />
      </div>
    );
  }

  return (
    <div className="retail-shell">
      <header className="retail-header">
        <h1>{branch.name}</h1>
        <button type="button" className="retail-cart-icon-btn" onClick={() => setCartOpen(true)}>
          <ShoppingCart size={20} />
          {itemCount > 0 && <span className="retail-badge">{itemCount}</span>}
        </button>
      </header>

      {categories.length > 1 && (
        <div className="retail-tabs">
          <button
            type="button"
            className={`retail-tab ${activeCategory === ALL ? 'active' : ''}`}
            onClick={() => setActiveCategory(ALL)}
          >
            Todo
          </button>
          {categories.map((cat) => (
            <button
              type="button"
              key={cat}
              className={`retail-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="retail-grid">
        {visibleServices.map((service) => {
          const qty = cart[service.id] ?? 0;
          return (
            <div className="retail-card" key={service.id}>
              <div className="retail-card-image">
                {service.image_url ? (
                  <img src={service.image_url} alt={service.name} />
                ) : (
                  <div className="retail-card-image-fallback">
                    <ImageOff size={28} />
                  </div>
                )}
              </div>
              <div className="retail-card-body">
                <span className="retail-card-name">{service.name}</span>
                <span className="retail-card-price">{formatGuaranies(service.price)}</span>
                <button
                  type="button"
                  className="retail-add-btn"
                  onClick={() => addToCart(service)}
                >
                  {qty > 0 ? `En carrito (${qty})` : 'Agregar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {itemCount > 0 && (
        <button type="button" className="retail-bottom-bar" onClick={() => setCartOpen(true)}>
          <span className="retail-bottom-count">{itemCount} producto{itemCount > 1 ? 's' : ''}</span>
          <span className="retail-bottom-total">{formatGuaranies(total)}</span>
          <span className="retail-bottom-cta">Ver carrito</span>
        </button>
      )}

      <div
        className={`retail-overlay ${cartOpen ? 'open' : ''}`}
        onClick={() => setCartOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`retail-drawer ${cartOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Tu carrito"
      >
        <div className="retail-drawer-head">
          <h3>Tu carrito</h3>
          <button
            type="button"
            aria-label="Cerrar carrito"
            onClick={() => setCartOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="retail-drawer-body">
          {lines.length === 0 ? (
            <div className="retail-cart-empty">Todavía no agregaste productos.</div>
          ) : (
            lines.map((line) => (
              <div className="retail-cart-item" key={line.service.id}>
                <div>
                  <div className="retail-cart-item-name">{line.service.name}</div>
                  <div className="retail-cart-item-price">
                    {formatGuaranies(line.service.price)} c/u
                  </div>
                </div>
                <div className="retail-qty-ctrl">
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
        <div className="retail-drawer-foot">
          <div className="retail-total-row">
            <span>Total</span>
            <strong>{formatGuaranies(total)}</strong>
          </div>
          <button
            type="button"
            className="retail-checkout-btn"
            disabled={lines.length === 0}
            onClick={() => {
              setCartOpen(false);
              goToCheckout();
            }}
          >
            Continuar compra
          </button>
        </div>
      </div>

      <RetailStyles />
    </div>
  );
}

function RetailStyles() {
  return (
    <style>{`
      .retail-shell {
        --retail-bg: #ffffff;
        --retail-surface: #f6f6f7;
        --retail-border: #e5e5e8;
        --retail-text: #16161a;
        --retail-text-secondary: #6b6b74;
        --retail-accent: #ff4d3d;
        --retail-accent-foreground: #ffffff;
        min-height: 100vh;
        background: var(--retail-bg);
        color: var(--retail-text);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        padding-bottom: 90px;
      }
      .retail-header {
        position: sticky;
        top: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px;
        background: var(--retail-bg);
        border-bottom: 1px solid var(--retail-border);
      }
      .retail-header h1 {
        font-size: 18px;
        font-weight: 700;
        margin: 0;
      }
      .retail-cart-icon-btn {
        position: relative;
        background: var(--retail-surface);
        border: 1px solid var(--retail-border);
        border-radius: 10px;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--retail-text);
      }
      .retail-badge {
        position: absolute;
        top: -6px;
        right: -6px;
        min-width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--retail-accent);
        color: var(--retail-accent-foreground);
        font-size: 10px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
      }
      .retail-tabs {
        display: flex;
        gap: 8px;
        padding: 14px 20px;
        overflow-x: auto;
      }
      .retail-tab {
        flex-shrink: 0;
        padding: 8px 14px;
        border-radius: 100px;
        border: 1px solid var(--retail-border);
        background: var(--retail-bg);
        color: var(--retail-text-secondary);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .retail-tab.active {
        background: var(--retail-text);
        color: var(--retail-bg);
        border-color: var(--retail-text);
      }
      .retail-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 14px;
        padding: 4px 20px 20px;
      }
      @media (min-width: 640px) {
        .retail-grid { grid-template-columns: repeat(3, 1fr); }
      }
      .retail-card {
        background: var(--retail-surface);
        border: 1px solid var(--retail-border);
        border-radius: 14px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .retail-card-image {
        aspect-ratio: 1 / 1;
        background: #eceef1;
      }
      .retail-card-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .retail-card-image-fallback {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #b6b8bf;
      }
      .retail-card-body {
        padding: 10px 12px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .retail-card-name {
        font-size: 13.5px;
        font-weight: 600;
        line-height: 1.3;
      }
      .retail-card-price {
        font-size: 14px;
        font-weight: 700;
        color: var(--retail-text);
      }
      .retail-add-btn {
        margin-top: 4px;
        padding: 9px;
        background: var(--retail-accent);
        color: var(--retail-accent-foreground);
        border: none;
        border-radius: 8px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        min-height: 38px;
      }
      .retail-bottom-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 40;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 14px 20px;
        background: var(--retail-text);
        color: #fff;
        border: none;
        cursor: pointer;
        font-size: 13px;
      }
      .retail-bottom-count { font-weight: 600; }
      .retail-bottom-total { font-weight: 700; }
      .retail-bottom-cta {
        background: var(--retail-accent);
        padding: 8px 14px;
        border-radius: 8px;
        font-weight: 700;
      }
      .retail-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.4);
        z-index: 90;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s;
      }
      .retail-overlay.open { opacity: 1; pointer-events: auto; }
      .retail-drawer {
        position: fixed;
        top: 0;
        right: 0;
        height: 100%;
        width: min(400px, 92vw);
        z-index: 91;
        background: var(--retail-bg);
        border-left: 1px solid var(--retail-border);
        transform: translateX(100%);
        transition: transform 0.3s ease;
        display: flex;
        flex-direction: column;
      }
      .retail-drawer.open { transform: translateX(0); }
      .retail-drawer-head {
        padding: 20px;
        border-bottom: 1px solid var(--retail-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .retail-drawer-head h3 { margin: 0; font-size: 16px; }
      .retail-drawer-head button {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--retail-text);
      }
      .retail-drawer-body { flex: 1; overflow-y: auto; padding: 6px 20px; }
      .retail-cart-empty {
        color: var(--retail-text-secondary);
        font-size: 13px;
        padding: 30px 0;
        text-align: center;
      }
      .retail-cart-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 0;
        border-bottom: 1px solid var(--retail-border);
        gap: 10px;
      }
      .retail-cart-item-name { font-size: 14px; font-weight: 600; }
      .retail-cart-item-price { font-size: 12px; color: var(--retail-text-secondary); margin-top: 2px; }
      .retail-qty-ctrl { display: flex; align-items: center; gap: 10px; }
      .retail-qty-ctrl button {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 1px solid var(--retail-border);
        background: var(--retail-surface);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .retail-drawer-foot { padding: 16px 20px 24px; border-top: 1px solid var(--retail-border); }
      .retail-total-row {
        display: flex;
        justify-content: space-between;
        font-size: 14px;
        margin-bottom: 14px;
      }
      .retail-total-row strong { font-size: 17px; }
      .retail-checkout-btn {
        width: 100%;
        padding: 14px;
        background: var(--retail-accent);
        color: var(--retail-accent-foreground);
        border: none;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        min-height: 44px;
      }
      .retail-checkout-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      /* ── Checkout / Success nav ── */
      .retail-nav-back {
        background: var(--retail-surface);
        border: 1px solid var(--retail-border);
        border-radius: 8px;
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 600;
        color: var(--retail-text);
        cursor: pointer;
      }
      .retail-checkout-page {
        max-width: 560px;
        margin: 0 auto;
        padding: 0 20px 40px;
      }
      .retail-checkout-eyebrow {
        font-size: 11px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: var(--retail-text-secondary);
        text-align: center;
        padding: 24px 0 4px;
        font-weight: 600;
      }

      /* ── CheckoutForm overrides inside retail-shell ── */
      .retail-shell label {
        font-size: 12px;
        font-weight: 600;
        color: var(--retail-text-secondary);
        text-transform: none;
        letter-spacing: 0;
      }
      .retail-shell input,
      .retail-shell textarea,
      .retail-shell select {
        background: var(--retail-surface);
        border: 1px solid var(--retail-border);
        border-radius: 8px;
        color: var(--retail-text);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      }
      .retail-shell input:focus,
      .retail-shell textarea:focus,
      .retail-shell select:focus {
        outline: none;
        border-color: var(--retail-accent);
      }
      .retail-shell .checkout-submit-btn {
        background: var(--retail-accent);
        color: var(--retail-accent-foreground);
        border-radius: 10px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: none;
      }

      /* ── OrderSuccess overrides inside retail-shell ── */
      .retail-shell .order-success {
        color: var(--retail-text);
        background: transparent;
        padding-top: 32px;
        text-align: center;
      }
      .retail-shell .whatsapp-btn {
        background: var(--retail-accent);
        color: var(--retail-accent-foreground);
        border-radius: 10px;
      }
    `}</style>
  );
}
