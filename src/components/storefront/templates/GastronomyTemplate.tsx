'use client';

import { useMemo, useState } from 'react';
import { ShoppingBag, X, Plus, Minus, MessageCircle } from 'lucide-react';
import { CheckoutForm } from '../CheckoutForm';
import { OrderSuccess } from '../OrderSuccess';
import { useStorefrontCart } from '../useStorefrontCart';
import { formatGuaranies } from '@/lib/utils';
import type { Branch, Service } from '@/types';

interface GastronomyTemplateProps {
  branch: Branch;
  services: Service[];
}

const UNCATEGORIZED = 'Otros';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Gastronomy vertical — "fuego/ámbar" identity inspired by the Tatapiriri
 * reference menu: dark ink-black/ember/amber palette, display serif for
 * headings + mono for prices/labels, category nav, ticket-style rows with a
 * dashed separator, and a slide-in cart drawer with WhatsApp handoff.
 * Categories are derived from real service.category values, not hardcoded.
 */
export function GastronomyTemplate({ branch, services }: GastronomyTemplateProps) {
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

  const categories = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const service of services) {
      const name = service.category?.trim() || UNCATEGORIZED;
      const list = map.get(name) ?? [];
      list.push(service);
      map.set(name, list);
    }
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      slug: slugify(name),
      items,
    }));
  }, [services]);

  if (step === 'success' && result && whatsappHref) {
    return (
      <div className="gastro-shell">
        <OrderSuccess orderCode={result.order_code} whatsappHref={whatsappHref} />
        <GastroStyles />
      </div>
    );
  }

  if (step === 'checkout') {
    return (
      <div className="gastro-shell">
        <CheckoutForm
          submitting={submitting}
          errorMessage={errorMessage}
          onSubmit={handleSubmit}
          onBack={backToCatalog}
        />
        <GastroStyles />
      </div>
    );
  }

  return (
    <div className="gastro-shell">
      <div className="gastro-grain" aria-hidden="true" />

      <nav className="gastro-nav">
        <div className="gastro-brand">
          <span className="gastro-brand-name">{branch.name}</span>
        </div>
        {categories.length > 0 && (
          <ul className="gastro-nav-links">
            {categories.map((cat) => (
              <li key={cat.slug}>
                <a href={`#${cat.slug}`}>{cat.name}</a>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="gastro-cart-btn" onClick={() => setCartOpen(true)}>
          Pedido <span className="gastro-cart-count">{itemCount}</span>
        </button>
      </nav>

      <section className="gastro-hero">
        <div className="gastro-ember-glow" aria-hidden="true" />
        <div className="gastro-hero-content">
          <div className="gastro-eyebrow">Menú online</div>
          <h1>{branch.name}</h1>
          <p>Elegí tus productos y armá tu pedido — te confirmamos todo por WhatsApp.</p>
        </div>
      </section>

      {categories.map((cat, idx) => (
        <section className="gastro-category" id={cat.slug} key={cat.slug}>
          <div className="gastro-cat-head">
            <div className="gastro-cat-tag">{String(idx + 1).padStart(2, '0')}</div>
            <h2>{cat.name}</h2>
          </div>
          <div className="gastro-ticket-grid">
            {cat.items.map((service) => {
              const qty = cart[service.id] ?? 0;
              return (
                <div className="gastro-ticket" key={service.id}>
                  <div>
                    <h3 className="gastro-ticket-name">{service.name}</h3>
                    {service.description && (
                      <p className="gastro-ticket-desc">{service.description}</p>
                    )}
                  </div>
                  <div className="gastro-ticket-right">
                    <span className="gastro-ticket-price">{formatGuaranies(service.price)}</span>
                    <button
                      type="button"
                      className="gastro-ticket-add"
                      onClick={() => addToCart(service)}
                    >
                      {qty > 0 ? `Agregado (${qty})` : '+ Agregar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <footer className="gastro-footer">
        <div className="gastro-fire-mark">— {branch.name} —</div>
        <h3>¿Listo para pedir?</h3>
        <p>Armá tu pedido arriba y enviálo directo por WhatsApp.</p>
      </footer>

      {itemCount > 0 && (
        <button type="button" className="gastro-fab" onClick={() => setCartOpen(true)}>
          <ShoppingBag size={16} />
          Ver pedido <span className="gastro-cart-count">{itemCount}</span>
        </button>
      )}

      <div
        className={`gastro-overlay ${cartOpen ? 'open' : ''}`}
        onClick={() => setCartOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`gastro-drawer ${cartOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Tu pedido"
      >
        <div className="gastro-drawer-head">
          <h3>Tu pedido</h3>
          <button
            type="button"
            className="gastro-drawer-close"
            onClick={() => setCartOpen(false)}
            aria-label="Cerrar pedido"
          >
            <X size={20} />
          </button>
        </div>
        <div className="gastro-drawer-body">
          {lines.length === 0 ? (
            <div className="gastro-cart-empty">Todavía no agregaste nada.</div>
          ) : (
            lines.map((line) => (
              <div className="gastro-cart-item" key={line.service.id}>
                <div>
                  <div className="gastro-cart-item-name">{line.service.name}</div>
                  <div className="gastro-cart-item-price">
                    {formatGuaranies(line.service.price)} c/u
                  </div>
                </div>
                <div className="gastro-qty-ctrl">
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
        <div className="gastro-drawer-foot">
          <div className="gastro-cart-total">
            <span>Total</span>
            <strong>{formatGuaranies(total)}</strong>
          </div>
          <button
            type="button"
            className="gastro-whatsapp-btn"
            disabled={lines.length === 0}
            onClick={() => {
              setCartOpen(false);
              goToCheckout();
            }}
          >
            <MessageCircle size={16} />
            Continuar pedido
          </button>
        </div>
      </div>

      <GastroStyles />
    </div>
  );
}

function GastroStyles() {
  return (
    <style>{`
      .gastro-shell {
        --ink-black: #140e0b;
        --char: #1c1512;
        --brick: #2b1c14;
        --ember: #b8531f;
        --ember-bright: #e0692a;
        --amber: #e8a566;
        --amber-dim: #c98a55;
        --cream: #fdf6ee;
        --parchment: #e9dcc9;
        --brass: #c2966a;
        --gastro-line: rgba(232, 165, 102, 0.18);
        --font-display: Georgia, 'Iowan Old Style', 'Palatino Linotype', serif;
        --font-mono: ui-monospace, 'SFMono-Regular', monospace;
        position: relative;
        min-height: 100vh;
        background: var(--ink-black);
        color: var(--cream);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        overflow-x: hidden;
      }
      .gastro-grain {
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.04;
        background-image: radial-gradient(circle, rgba(232,165,102,0.5) 1px, transparent 1px);
        background-size: 3px 3px;
      }
      .gastro-nav {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        row-gap: 10px;
        padding: 14px 20px;
        background: linear-gradient(180deg, rgba(20,14,11,0.95), rgba(20,14,11,0.75));
        backdrop-filter: blur(10px);
        border-bottom: 1px solid var(--gastro-line);
      }
      .gastro-brand-name {
        font-family: var(--font-display);
        font-size: 18px;
        color: var(--cream);
      }
      .gastro-nav-links {
        display: flex;
        gap: 16px;
        list-style: none;
        margin: 0;
        padding: 0;
        order: 3;
        flex-basis: 100%;
        overflow-x: auto;
        border-top: 1px dashed var(--gastro-line);
        padding-top: 10px;
      }
      .gastro-nav-links a {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: var(--parchment);
        text-decoration: none;
        opacity: 0.75;
        white-space: nowrap;
      }
      .gastro-cart-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        background: transparent;
        border: 1px solid var(--gastro-line);
        color: var(--cream);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 1px;
        padding: 8px 14px;
        border-radius: 100px;
        cursor: pointer;
      }
      .gastro-cart-count {
        min-width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--ember-bright);
        color: var(--ink-black);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 600;
        padding: 0 4px;
      }
      .gastro-hero {
        position: relative;
        padding: 60px 20px 50px;
        text-align: center;
        overflow: hidden;
      }
      .gastro-hero::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 60% 40% at 50% 105%, rgba(224,105,42,0.35), transparent 70%),
          linear-gradient(180deg, var(--ink-black) 0%, var(--char) 60%, var(--brick) 100%);
        z-index: 0;
      }
      .gastro-ember-glow {
        position: absolute;
        bottom: -20%;
        left: 50%;
        transform: translateX(-50%);
        width: 500px;
        height: 500px;
        max-width: 160vw;
        background: radial-gradient(circle, rgba(224,105,42,0.28) 0%, transparent 65%);
        filter: blur(10px);
        z-index: 0;
      }
      .gastro-hero-content {
        position: relative;
        z-index: 1;
        max-width: 600px;
        margin: 0 auto;
      }
      .gastro-eyebrow {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: var(--amber);
        margin-bottom: 16px;
      }
      .gastro-hero-content h1 {
        font-family: var(--font-display);
        font-weight: 400;
        font-size: clamp(32px, 8vw, 56px);
        margin: 0 0 16px;
        color: var(--cream);
      }
      .gastro-hero-content p {
        font-size: 14px;
        line-height: 1.7;
        color: var(--parchment);
        opacity: 0.85;
        margin: 0;
      }
      .gastro-category {
        position: relative;
        z-index: 1;
        padding: 40px 20px 10px;
        max-width: 720px;
        margin: 0 auto;
        scroll-margin-top: 90px;
      }
      .gastro-cat-tag {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 2px;
        color: var(--ember-bright);
        margin-bottom: 8px;
      }
      .gastro-cat-head h2 {
        font-family: var(--font-display);
        font-size: clamp(24px, 5vw, 34px);
        margin: 0 0 24px;
        color: var(--cream);
        font-weight: 400;
      }
      .gastro-ticket-grid {
        display: grid;
        gap: 0;
      }
      .gastro-ticket {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 14px;
        align-items: start;
        padding: 18px 2px;
        border-bottom: 1px dashed var(--gastro-line);
      }
      .gastro-ticket:first-child {
        border-top: 1px dashed var(--gastro-line);
      }
      .gastro-ticket-name {
        font-family: var(--font-display);
        font-size: 18px;
        color: var(--cream);
        margin: 0 0 6px;
        font-weight: 400;
      }
      .gastro-ticket-desc {
        font-size: 12.5px;
        line-height: 1.6;
        color: var(--parchment);
        opacity: 0.72;
        margin: 0;
      }
      .gastro-ticket-right {
        text-align: right;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }
      .gastro-ticket-price {
        font-family: var(--font-mono);
        font-size: 14px;
        color: var(--amber);
        white-space: nowrap;
      }
      .gastro-ticket-add {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: var(--brass);
        background: none;
        border: 1px solid var(--gastro-line);
        padding: 6px 12px;
        border-radius: 100px;
        cursor: pointer;
        white-space: nowrap;
        min-height: 32px;
      }
      .gastro-ticket-add:hover {
        border-color: var(--ember-bright);
        color: var(--amber);
      }
      .gastro-footer {
        position: relative;
        z-index: 1;
        padding: 60px 20px 90px;
        text-align: center;
        border-top: 1px solid var(--gastro-line);
        margin-top: 40px;
      }
      .gastro-fire-mark {
        font-family: var(--font-display);
        font-size: 14px;
        color: var(--amber);
        font-style: italic;
        margin-bottom: 8px;
      }
      .gastro-footer h3 {
        font-family: var(--font-display);
        font-size: 24px;
        color: var(--cream);
        font-weight: 400;
        margin: 0 0 10px;
      }
      .gastro-footer p {
        font-size: 13px;
        color: var(--brass);
        max-width: 380px;
        margin: 0 auto;
      }
      .gastro-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 60;
        background: var(--ember-bright);
        color: var(--ink-black);
        border: none;
        border-radius: 100px;
        padding: 13px 18px;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(184,83,31,0.4);
      }
      @media (min-width: 761px) {
        .gastro-fab { display: none; }
      }
      .gastro-overlay {
        position: fixed;
        inset: 0;
        background: rgba(10,7,5,0.7);
        z-index: 90;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s;
      }
      .gastro-overlay.open {
        opacity: 1;
        pointer-events: auto;
      }
      .gastro-drawer {
        position: fixed;
        top: 0;
        right: 0;
        height: 100%;
        width: min(400px, 92vw);
        z-index: 91;
        background: var(--char);
        border-left: 1px solid var(--gastro-line);
        transform: translateX(100%);
        transition: transform 0.3s ease;
        display: flex;
        flex-direction: column;
      }
      .gastro-drawer.open {
        transform: translateX(0);
      }
      .gastro-drawer-head {
        padding: 20px;
        border-bottom: 1px solid var(--gastro-line);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .gastro-drawer-head h3 {
        font-family: var(--font-display);
        font-size: 18px;
        color: var(--cream);
        margin: 0;
        font-weight: 400;
      }
      .gastro-drawer-close {
        background: none;
        border: none;
        color: var(--brass);
        cursor: pointer;
        display: flex;
      }
      .gastro-drawer-body {
        flex: 1;
        overflow-y: auto;
        padding: 8px 20px;
      }
      .gastro-cart-empty {
        color: var(--brass);
        font-size: 13px;
        padding: 30px 0;
        text-align: center;
      }
      .gastro-cart-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 0;
        border-bottom: 1px dashed var(--gastro-line);
        gap: 10px;
      }
      .gastro-cart-item-name {
        font-size: 14px;
        color: var(--cream);
      }
      .gastro-cart-item-price {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--brass);
        margin-top: 3px;
      }
      .gastro-qty-ctrl {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .gastro-qty-ctrl button {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 1px solid var(--gastro-line);
        background: none;
        color: var(--amber);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .gastro-drawer-foot {
        padding: 16px 20px 24px;
        border-top: 1px solid var(--gastro-line);
      }
      .gastro-cart-total {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size: 14px;
        color: var(--cream);
        margin-bottom: 14px;
      }
      .gastro-cart-total strong {
        color: var(--amber);
        font-size: 17px;
      }
      .gastro-whatsapp-btn {
        width: 100%;
        padding: 14px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        background: var(--ember-bright);
        color: var(--ink-black);
        font-size: 13px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 44px;
      }
      .gastro-whatsapp-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    `}</style>
  );
}
