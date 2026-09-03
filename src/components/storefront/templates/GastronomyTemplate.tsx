'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ShoppingBag, X, Plus, Minus, MessageCircle, ChevronLeft, ChevronRight, UtensilsCrossed } from 'lucide-react';
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

// Pointer-drag threshold (px) before a swipe counts as prev/next, mirroring
// the reference artifact's `Math.abs(dx) > 48` rule.
const SWIPE_THRESHOLD = 48;

/**
 * Gastronomy vertical — "La Pizzería" reference: one product at a time,
 * navigated with prev/next arrows, dot indicators, and real touch/pointer
 * swipe, instead of a category list. Products come from the branch's real
 * `services` (same flat order `getCatalog` already provides — no category
 * grouping, no hardcoded data). No size picker, no ingredients section, and
 * no phone-mockup chrome — this page fills the visitor's actual viewport.
 * Cart/checkout wiring (`useStorefrontCart`, `CheckoutForm`, `OrderSuccess`)
 * is reused unchanged; the cart badge + drawer is this template's own
 * addition since the reference artifact has no such affordance.
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
  const [current, setCurrent] = useState(0);
  const [dragX, setDragX] = useState(0);
  // A ref (not plain state) survives across the pointerdown -> pointermove ->
  // pointerup sequence without being reset by the re-renders that setDragX
  // triggers in between — a plain object recreated each render would lose
  // `active` on the very first pointermove.
  const dragState = useRef({ active: false, startX: 0 });

  const lastIndex = services.length - 1;
  const product = services[current];

  // Clamped navigation — no wrap-around, matching the reference artifact's
  // elastic "bounce" behavior at both ends (it snaps back instead of looping
  // to the other side).
  const goTo = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex > lastIndex) return;
    setCurrent(nextIndex);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragState.current.active = true;
    dragState.current.startX = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    setDragX(e.clientX - dragState.current.startX);
  };

  const endDrag = () => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      goTo(current + (dragX < 0 ? 1 : -1));
    }
    setDragX(0);
  };

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

      <nav className="gastro-nav">
        <span className="gastro-brand-name">{branch.name}</span>
        <button
          type="button"
          className="gastro-cart-btn"
          aria-label="Abrir pedido"
          onClick={() => setCartOpen(true)}
        >
          Pedido <span className="gastro-cart-count">{itemCount}</span>
        </button>
      </nav>

      {!product ? (
        <div className="gastro-empty">No hay productos disponibles todavía.</div>
      ) : (
        <main className="gastro-stage">
          <div
            className="gastro-product-circle"
            style={{ transform: dragX ? `translateX(${dragX * 0.4}px)` : undefined }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="gastro-product-shadow" aria-hidden="true" />
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- storefront images come from arbitrary Supabase Storage URLs, not part of the Next.js image pipeline.
              <img src={product.image_url} alt={product.name} draggable={false} />
            ) : (
              <div className="gastro-product-circle-fallback">
                <UtensilsCrossed size={40} strokeWidth={1.5} aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="gastro-arrows">
            <button
              type="button"
              className="gastro-arrow-btn"
              aria-label="Producto anterior"
              onClick={() => goTo(current - 1)}
              disabled={current === 0}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="gastro-dots">
              {services.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  className={`gastro-dot${idx === current ? ' active' : ''}`}
                  aria-label={`Ir al producto ${idx + 1}`}
                  aria-current={idx === current}
                  onClick={() => goTo(idx)}
                />
              ))}
            </div>
            <button
              type="button"
              className="gastro-arrow-btn"
              aria-label="Producto siguiente"
              onClick={() => goTo(current + 1)}
              disabled={current === lastIndex}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="gastro-info">
            <h1 className="gastro-product-name">{product.name}</h1>
            {product.description && <p className="gastro-product-desc">{product.description}</p>}
            <div className="gastro-price-row">
              <span className="gastro-price">{formatGuaranies(product.price)}</span>
              <span className="gastro-price-tag">por unidad</span>
            </div>
          </div>

          <div className="gastro-bottom-bar">
            <div className="gastro-qty-ctrl">
              <button
                type="button"
                aria-label="Restar"
                onClick={() => decrement(product.id)}
                disabled={(cart[product.id] ?? 0) === 0}
              >
                <Minus size={16} />
              </button>
              <span className="gastro-qty-num">{cart[product.id] ?? 0}</span>
              <button type="button" aria-label="Sumar" onClick={() => increment(product.id)}>
                <Plus size={16} />
              </button>
            </div>
            <button type="button" className="gastro-add-btn" onClick={() => addToCart(product)}>
              <ShoppingBag size={16} />
              Agregar al carrito
            </button>
          </div>
        </main>
      )}

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
        display: flex;
        flex-direction: column;
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
      .gastro-nav {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: space-between;
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

      /* ── Single-product stage (swipe) ── */
      .gastro-stage {
        position: relative;
        z-index: 1;
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 480px;
        margin: 0 auto;
        padding: 40px 24px 24px;
        touch-action: pan-y;
      }
      .gastro-empty {
        position: relative;
        z-index: 1;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 60px 24px;
        color: var(--smoke);
        font-family: var(--font-body);
        font-size: 14px;
      }
      .gastro-product-circle {
        position: relative;
        width: clamp(200px, 60vw, 270px);
        height: clamp(200px, 60vw, 270px);
        flex-shrink: 0;
        cursor: grab;
        touch-action: none;
        border-radius: 50%;
      }
      .gastro-product-circle:active {
        cursor: grabbing;
      }
      .gastro-product-shadow {
        position: absolute;
        bottom: -18px;
        left: 50%;
        transform: translateX(-50%);
        width: 85%;
        height: 26px;
        background: radial-gradient(ellipse, var(--shadow) 0%, transparent 70%);
        border-radius: 50%;
        pointer-events: none;
      }
      .gastro-product-circle img,
      .gastro-product-circle-fallback {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
        display: block;
        box-shadow:
          0 0 0 5px var(--card),
          0 0 0 6px var(--ash),
          0 16px 50px var(--shadow),
          0 0 60px var(--glow);
        user-select: none;
        -webkit-user-drag: none;
      }
      .gastro-product-circle-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle, var(--ember-lo), var(--card));
        color: var(--ember);
      }
      .gastro-arrows {
        display: flex;
        align-items: center;
        gap: 24px;
        margin-top: 24px;
      }
      .gastro-arrow-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1.5px solid var(--ash);
        background: var(--white);
        color: var(--smoke);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all .2s;
      }
      .gastro-arrow-btn:hover:not(:disabled) {
        border-color: var(--ember);
        color: var(--ember);
      }
      .gastro-arrow-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .gastro-dots {
        display: flex;
        gap: 5px;
        align-items: center;
      }
      .gastro-dot {
        width: 5px;
        height: 5px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: var(--ash);
        cursor: pointer;
        transition: all .35s cubic-bezier(.4,0,.2,1);
      }
      .gastro-dot.active {
        width: 20px;
        border-radius: 3px;
        background: var(--ember);
      }
      .gastro-info {
        width: 100%;
        text-align: center;
        margin-top: 28px;
      }
      .gastro-product-name {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: clamp(24px, 6vw, 32px);
        color: var(--charcoal);
        margin: 0;
        line-height: 1.15;
      }
      .gastro-product-desc {
        font-family: var(--font-display);
        font-style: italic;
        font-size: 14px;
        color: var(--smoke);
        margin: 6px 0 0;
      }
      .gastro-price-row {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 12px;
        margin-top: 16px;
      }
      .gastro-price {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 32px;
        color: var(--charcoal);
      }
      .gastro-price-tag {
        font-family: var(--font-body);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: var(--ember);
        background: var(--ember-lo);
        padding: 3px 8px;
        border-radius: 4px;
      }
      .gastro-bottom-bar {
        position: sticky;
        bottom: 0;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 32px;
        padding: 16px 0 8px;
        background: linear-gradient(to top, var(--linen) 70%, transparent);
      }
      .gastro-bottom-bar .gastro-qty-ctrl {
        display: flex;
        align-items: center;
        background: var(--white);
        border: 1.5px solid var(--ash);
        border-radius: 50px;
        overflow: hidden;
      }
      .gastro-bottom-bar .gastro-qty-ctrl button {
        width: 40px;
        height: 48px;
        border: none;
        background: transparent;
        color: var(--charcoal);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .gastro-bottom-bar .gastro-qty-ctrl button:hover:not(:disabled) {
        background: var(--ember-lo);
      }
      .gastro-bottom-bar .gastro-qty-ctrl button:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .gastro-qty-num {
        width: 30px;
        text-align: center;
        font-family: var(--font-body);
        font-size: 15px;
        font-weight: 700;
        color: var(--charcoal);
      }
      .gastro-add-btn {
        flex: 1;
        height: 50px;
        background: var(--charcoal);
        color: var(--card);
        border: none;
        border-radius: 50px;
        font-family: var(--font-body);
        font-size: 14px;
        font-weight: 600;
        letter-spacing: .3px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 4px 16px var(--shadow);
        transition: background .2s, box-shadow .15s;
      }
      .gastro-add-btn:hover {
        background: var(--ember);
        box-shadow: 0 6px 20px var(--glow);
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
        display: none;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        box-shadow: 0 8px 24px var(--shadow), 0 0 40px var(--glow);
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
      .gastro-drawer-body .gastro-qty-ctrl {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .gastro-drawer-body .gastro-qty-ctrl button {
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

      @media (max-width: 760px) {
        .gastro-fab { display: flex; }
      }
    `}</style>
  );
}
