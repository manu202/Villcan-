'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Scroll-spy for a sticky category nav: tracks which catalog section is
 * "current" as the user scrolls, and keeps the corresponding pill scrolled
 * into view in the horizontal nav strip.
 *
 * Extracted from GastronomyTemplate's original inline implementation, with
 * three fixes (see SDD "Sticky Header + Intersection Observer"):
 *
 *  1. The header height is measured live via ResizeObserver instead of a
 *     hardcoded `-50px` in the IntersectionObserver rootMargin — the nav's
 *     actual height changes when the brand text wraps on narrow screens.
 *  2. Category anchors get `scroll-margin-top` (via the returned `navHeight`,
 *     which callers apply as a CSS var) instead of relying on the browser's
 *     native `#hash` jump, which lands the section under the sticky header.
 *  3. A `scrollend`-driven guard (with a timeout fallback for Safari, which
 *     doesn't support `scrollend` yet) suppresses observer updates while a
 *     programmatic smooth-scroll is in flight, so the active pill doesn't
 *     flicker through every section it passes on the way to the target.
 */
export interface UseActiveCategoryOptions {
  /** Category labels in display order — must match the section ids via slugify. */
  categories: string[];
  /** Same slugify function the template uses to derive section/anchor ids. */
  slugify: (label: string) => string;
}

export interface UseActiveCategoryResult {
  /** The category currently considered "in view". */
  activeCategory: string;
  /** Ref to attach to the header element whose height drives the offset. */
  navRef: React.RefObject<HTMLElement | null>;
  /** Ref to attach to the scrollable pill list, so the active pill can be scrolled into view. */
  pillListRef: React.RefObject<HTMLElement | null>;
  /** Live-measured nav height in px — expose as `scroll-margin-top` / `--sf-nav-h` on sections. */
  navHeight: number;
  /** Click handler for a category pill/anchor: scrolls smoothly and suppresses spy flicker. */
  selectCategory: (category: string) => void;
}

const SCROLLEND_FALLBACK_MS = 700;

export function useActiveCategory({
  categories,
  slugify,
}: UseActiveCategoryOptions): UseActiveCategoryResult {
  const [activeCategory, setActiveCategory] = useState('');
  const [navHeight, setNavHeight] = useState(0);
  const navRef = useRef<HTMLElement | null>(null);
  const pillListRef = useRef<HTMLElement | null>(null);
  const suppressSpyRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fix 1 — measure the real header height instead of hardcoding it.
  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setNavHeight(entry.contentRect.height);
    });
    obs.observe(el);
    setNavHeight(el.getBoundingClientRect().height);
    return () => obs.disconnect();
  }, []);

  // Scroll-spy: the category whose section crosses a thin band just below
  // the sticky header is "active". The asymmetric rootMargin (small top cut,
  // large bottom cut) collapses the effective viewport to that band — without
  // it, two sections visible at once would both report as intersecting and
  // the active pill would flicker between them.
  useEffect(() => {
    if (categories.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const topCut = Math.max(navHeight, 1);
    const obs = new IntersectionObserver(
      (entries) => {
        if (suppressSpyRef.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const matched = categories.find((cat) => slugify(cat) === entry.target.id);
            if (matched) setActiveCategory(matched);
          }
        }
      },
      { rootMargin: `-${topCut}px 0px -62% 0px`, threshold: 0 },
    );
    for (const cat of categories) {
      const el = document.getElementById(slugify(cat));
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, navHeight]);

  // Falls back to the first category until the observer reports an
  // intersection — avoids a synchronous setState in the effect above just to
  // seed an initial value (react-hooks/set-state-in-effect).
  const resolvedActiveCategory = activeCategory || categories[0] || '';

  // Keep the active pill visible inside the horizontal scroller.
  useEffect(() => {
    if (!resolvedActiveCategory || !pillListRef.current) return;
    const active = pillListRef.current.querySelector('[data-active="true"]') as HTMLElement | null;
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [resolvedActiveCategory]);

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  // Fix 3 — tapping a pill triggers a smooth scroll that itself crosses
  // several sections; suppress spy updates until that scroll settles so the
  // active pill jumps straight to the target instead of stepping through
  // every section along the way.
  const selectCategory = (category: string) => {
    const el = document.getElementById(slugify(category));
    if (!el) return;
    suppressSpyRef.current = true;
    setActiveCategory(category);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const release = () => {
      suppressSpyRef.current = false;
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      window.removeEventListener('scrollend', release);
    };
    if ('onscrollend' in window) {
      window.addEventListener('scrollend', release, { once: true });
    } else {
      // Safari fallback: scrollend isn't supported, so release after the
      // smooth-scroll would plausibly have finished.
      fallbackTimerRef.current = setTimeout(release, SCROLLEND_FALLBACK_MS);
    }
  };

  return { activeCategory: resolvedActiveCategory, navRef, pillListRef, navHeight, selectCategory };
}
