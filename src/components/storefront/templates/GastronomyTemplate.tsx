'use client';

import { useMemo, useState } from 'react';
import { ShoppingBag, X, Plus, Minus, MessageCircle, UtensilsCrossed } from 'lucide-react';
import { CheckoutForm } from '../CheckoutForm';
import { OrderSuccess } from '../OrderSuccess';
import { useStorefrontCart } from '../useStorefrontCart';
import { formatGuaranies } from '@/lib/utils';
import type { Branch, Service } from '@/types';

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600;700&display=swap';

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
 * Gastronomy vertical — warm linen/terracotta identity ("La Pizzería"
 * reference palette): cream/charcoal/ember light palette with an equivalent
 * dark variant, Playfair Display for the business name, product names and
 * prices, DM Sans for everything else. A page-level hero (business name +
 * circular photo, no per-product mockup chrome, no swipe) sits above the
 * category nav. Categories are derived from real service.category values,
 * not hardcoded. Catalog/cart/checkout behavior is unchanged — only the
 * visual skin moved from the previous ember/ink-black identity.
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

  // No dedicated "cover image" field on branches — the hero photo is the
  // first catalog service that has one, following the same category/name
  // order `getCatalog` already provides. With no image anywhere, fall back
  // to a decorative gradient circle instead of a broken-image icon.
  const heroImage = useMemo(() => services.find((s) => s.image_url)?.image_url ?? null, [services]);

  if (step === 'success' && result && whatsappHref) {
    return (
      <div className="gastro-shell">
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
        <nav className="gastro-nav">
          <span className="gastro-brand-name">{branch.name}</span>
        </nav>
        <OrderSuccess orderCode={result.order_code} whatsappHref={whatsappHref} />
        <GastroStyles />
      </div>
    );
  }

  if (step === 'checkout') {
    return (
      <div className="gastro-shell">
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
        <nav className="gastro-nav">
          <span className="gastro-brand-name">{branch.name}</span>
          <button type="button" className="gastro-cart-btn" onClick={backToCatalog}>
            ← Volver
          </button>
        </nav>
        <div className="gastro-checkout-page">
          <div className="gastro-checkout-eyebrow">Confirmá tu pedido</div>
          <CheckoutForm
            submitting={submitting}
            errorMessage={errorMessage}
            onSubmit={handleSubmit}
            onBack={backToCatalog}
          />
        </div>
        <GastroStyles />
      </div>
    );
  }

  return (
    <div className="gastro-shell">
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      <div className="gastro-grain" aria-hidden="true" />

      <header className="gastro-hero">
        <div className={`gastro-hero-circle${heroImage ? '' : ' gastro-hero-circle--fallback'}`}>
          {heroImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- storefront images come from arbitrary Supabase Storage URLs, not part of the Next.js image pipeline.
            <img src={heroImage} alt={branch.name} />
          ) : (
            <UtensilsCrossed size={40} strokeWidth={1.5} aria-hidden="true" />
          )}
        </div>
        <h1 className="gastro-hero-name">{branch.name}</h1>
        <p className="gastro-hero-tagline">
          Elegí tus productos y armá tu pedido — te confirmamos todo por WhatsApp.
        </p>
      </header>

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
        --linen: #F7F2EC;
        --linen-2: #EEE7DC;
        --charcoal: #1C1714;
        --ember: #C4783A;
        --ember-lo: rgba(196, 120, 58, .15);
        --smoke: #8A7E74;
        --ash: #E0D8CF;
        --card: #FDFAF6;
        --white: #FFFFFF;
        --shadow: rgba(28, 23, 20, .12);
        --glow: rgba(196, 120, 58, .22);
        --font-display: 'Playfair Display', Georgia, 'Iowan Old Style', 'Palatino Linotype', serif;
        --font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        position: relative;
        min-height: 100vh;
        background: var(--linen);
        color: var(--charcoal);
        font-family: var(--font-body);
        color-scheme: light;
        /* overflow-x: clip instead of hidden — clip prevents horizontal overflow
           without creating a new scroll container, so position: sticky on
           .gastro-nav continues to stick to the viewport correctly. */
        overflow-x: clip;
      }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme]) .gastro-shell {
          --linen: #1C1714;
          --linen-2: #241F1B;
          --charcoal: #F0EBE2;
          --ember: #D4894A;
          --ember-lo: rgba(212, 137, 74, .18);
          --smoke: #9A8E84;
          --ash: #3A322C;
          --card: #261F1A;
          --white: #2E261F;
          --shadow: rgba(0, 0, 0, .4);
          --glow: rgba(212, 137, 74, .3);
          color-scheme: dark;
        }
      }
      :root[data-theme='dark'] .gastro-shell {
        --linen: #1C1714;
        --linen-2: #241F1B;
        --charcoal: #F0EBE2;
        --ember: #D4894A;
        --ember-lo: rgba(212, 137, 74, .18);
        --smoke: #9A8E84;
        --ash: #3A322C;
        --card: #261F1A;
        --white: #2E261F;
        --shadow: rgba(0, 0, 0, .4);
        --glow: rgba(212, 137, 74, .3);
        color-scheme: dark;
      }
      .gastro-grain {
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.035;
        background-image: radial-gradient(circle, rgba(196,120,58,0.5) 1px, transparent 1px);
        background-size: 3px 3px;
      }
      .gastro-hero {
        position: relative;
        z-index: 1;
        padding: 48px 20px 36px;
        text-align: center;
        max-width: 520px;
        margin: 0 auto;
      }
      .gastro-hero-circle {
        width: clamp(120px, 32vw, 176px);
        height: clamp(120px, 32vw, 176px);
        margin: 0 auto 20px;
        border-radius: 50%;
        overflow: hidden;
        box-shadow:
          0 0 0 5px var(--card),
          0 0 0 6px var(--ash),
          0 16px 50px var(--shadow),
          0 0 60px var(--glow);
      }
      .gastro-hero-circle img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .gastro-hero-circle--fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle, var(--ember-lo), var(--card));
        color: var(--ember);
      }
      .gastro-hero-name {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: clamp(28px, 7vw, 44px);
        margin: 0 0 12px;
        color: var(--charcoal);
      }
      .gastro-hero-tagline {
        font-family: var(--font-body);
        font-size: 14px;
        line-height: 1.7;
        color: var(--smoke);
        margin: 0;
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
        background: rgba(247, 242, 236, 0.9);
        background: color-mix(in srgb, var(--linen) 90%, transparent);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid var(--ash);
      }
      .gastro-brand-name {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 18px;
        color: var(--charcoal);
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
        border-top: 1px dashed var(--ash);
        padding-top: 10px;
      }
      .gastro-nav-links a {
        font-family: var(--font-body);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: var(--smoke);
        text-decoration: none;
        white-space: nowrap;
      }
      .gastro-cart-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--card);
        border: 1px solid var(--ash);
        color: var(--charcoal);
        font-family: var(--font-body);
        font-weight: 600;
        font-size: 12px;
        padding: 8px 14px;
        border-radius: 100px;
        cursor: pointer;
      }
      .gastro-cart-count {
        min-width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--ember);
        color: var(--white);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        padding: 0 4px;
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
        font-family: var(--font-body);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 2px;
        color: var(--ember);
        margin-bottom: 8px;
      }
      .gastro-cat-head h2 {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: clamp(24px, 5vw, 34px);
        margin: 0 0 24px;
        color: var(--charcoal);
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
        padding: 18px 12px;
        border-bottom: 1px solid var(--ash);
        background: var(--card);
        border-radius: 12px;
        margin-bottom: 10px;
      }
      .gastro-ticket-name {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 18px;
        color: var(--charcoal);
        margin: 0 0 6px;
      }
      .gastro-ticket-desc {
        font-family: var(--font-body);
        font-size: 12.5px;
        line-height: 1.6;
        color: var(--smoke);
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
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 16px;
        color: var(--ember);
        white-space: nowrap;
      }
      .gastro-ticket-add {
        font-family: var(--font-body);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: var(--ember);
        background: var(--ember-lo);
        border: 1px solid transparent;
        padding: 6px 12px;
        border-radius: 100px;
        cursor: pointer;
        white-space: nowrap;
        min-height: 32px;
      }
      .gastro-ticket-add:hover {
        border-color: var(--ember);
      }
      .gastro-footer {
        position: relative;
        z-index: 1;
        padding: 60px 20px 90px;
        text-align: center;
        border-top: 1px solid var(--ash);
        margin-top: 40px;
      }
      .gastro-fire-mark {
        font-family: var(--font-display);
        font-style: italic;
        font-weight: 600;
        font-size: 14px;
        color: var(--ember);
        margin-bottom: 8px;
      }
      .gastro-footer h3 {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 24px;
        color: var(--charcoal);
        margin: 0 0 10px;
      }
      .gastro-footer p {
        font-family: var(--font-body);
        font-size: 13px;
        color: var(--smoke);
        max-width: 380px;
        margin: 0 auto;
      }
      .gastro-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 60;
        background: var(--ember);
        color: var(--white);
        border: none;
        border-radius: 100px;
        padding: 13px 18px;
        font-family: var(--font-body);
        font-size: 13px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        box-shadow: 0 8px 24px var(--shadow), 0 0 40px var(--glow);
      }
      @media (min-width: 761px) {
        .gastro-fab { display: none; }
      }
      .gastro-overlay {
        position: fixed;
        inset: 0;
        background: rgba(20, 15, 12, 0.55);
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
        background: var(--card);
        border-left: 1px solid var(--ash);
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
        border-bottom: 1px solid var(--ash);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .gastro-drawer-head h3 {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 18px;
        color: var(--charcoal);
        margin: 0;
      }
      .gastro-drawer-close {
        background: none;
        border: none;
        color: var(--smoke);
        cursor: pointer;
        display: flex;
      }
      .gastro-drawer-body {
        flex: 1;
        overflow-y: auto;
        padding: 8px 20px;
      }
      .gastro-cart-empty {
        font-family: var(--font-body);
        color: var(--smoke);
        font-size: 13px;
        padding: 30px 0;
        text-align: center;
      }
      .gastro-cart-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 0;
        border-bottom: 1px dashed var(--ash);
        gap: 10px;
      }
      .gastro-cart-item-name {
        font-family: var(--font-body);
        font-weight: 500;
        font-size: 14px;
        color: var(--charcoal);
      }
      .gastro-cart-item-price {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 12px;
        color: var(--smoke);
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
        border: 1px solid var(--ash);
        background: var(--linen);
        color: var(--ember);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .gastro-drawer-foot {
        padding: 16px 20px 24px;
        border-top: 1px solid var(--ash);
      }
      .gastro-cart-total {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-body);
        font-weight: 600;
        font-size: 14px;
        color: var(--charcoal);
        margin-bottom: 14px;
      }
      .gastro-cart-total strong {
        font-family: var(--font-display);
        color: var(--ember);
        font-size: 18px;
      }
      .gastro-whatsapp-btn {
        width: 100%;
        padding: 14px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        background: var(--charcoal);
        color: var(--card);
        font-family: var(--font-body);
        font-size: 13px;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        font-weight: 700;
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

      /* ── Checkout & success inside gastro context ── */
      .gastro-checkout-page {
        position: relative;
        z-index: 1;
        max-width: 540px;
        margin: 0 auto;
        padding: 32px 20px 80px;
      }
      .gastro-checkout-eyebrow {
        font-family: var(--font-body);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: var(--ember);
        margin-bottom: 28px;
      }
      .gastro-shell .checkout-form {
        gap: 16px;
        padding: 0;
      }
      .gastro-shell .checkout-back-btn {
        color: var(--smoke);
        font-family: var(--font-body);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        min-height: unset;
      }
      .gastro-shell .checkout-back-btn:hover { color: var(--ember); }
      .gastro-shell label {
        font-family: var(--font-body);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        color: var(--smoke);
      }
      .gastro-shell input,
      .gastro-shell textarea,
      .gastro-shell select {
        font-family: var(--font-body);
        background: var(--card);
        border: 1px solid var(--ash);
        border-radius: 8px;
        color: var(--charcoal);
      }
      .gastro-shell input:focus,
      .gastro-shell textarea:focus,
      .gastro-shell select:focus {
        outline: none;
        border-color: var(--ember);
        background: var(--white);
      }
      .gastro-shell .checkout-error { color: #B3261E; }
      :root[data-theme='dark'] .gastro-shell .checkout-error { color: #FF8A80; }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme]) .gastro-shell .checkout-error { color: #FF8A80; }
      }
      .gastro-shell .checkout-submit-btn {
        background: var(--ember);
        color: var(--white);
        border-radius: 8px;
        font-family: var(--font-body);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.6px;
        text-transform: uppercase;
      }
      .gastro-shell .checkout-submit-btn:hover:not(:disabled) {
        filter: brightness(0.94);
      }

      /* Success page */
      .gastro-shell .order-success {
        text-align: center;
        padding: 80px 24px;
        max-width: 480px;
        margin: 0 auto;
        position: relative;
        z-index: 1;
      }
      .gastro-shell .order-success h2 {
        font-family: var(--font-display);
        font-size: clamp(22px, 5vw, 32px);
        font-weight: 700;
        color: var(--charcoal);
        margin-bottom: 12px;
      }
      .gastro-shell .order-success p {
        font-family: var(--font-body);
        font-size: 14px;
        color: var(--smoke);
        margin-bottom: 32px;
        line-height: 1.6;
      }
      .gastro-shell .whatsapp-btn {
        background: var(--charcoal);
        color: var(--card);
        border-radius: 8px;
        font-family: var(--font-body);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.6px;
        text-transform: uppercase;
      }
      .gastro-shell .whatsapp-btn:hover { filter: brightness(1.1); }
    `}</style>
  );
}
