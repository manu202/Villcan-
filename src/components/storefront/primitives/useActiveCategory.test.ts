import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActiveCategory } from './useActiveCategory';

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-');
}

describe('useActiveCategory', () => {
  beforeEach(() => {
    // jsdom's stub IntersectionObserver/ResizeObserver (vitest.setup.ts) never
    // fire callbacks on their own — these tests exercise the parts of the
    // hook that don't depend on an observer actually firing (initial state,
    // selectCategory's imperative scroll + suppression window).
    vi.stubGlobal('scrollIntoView', vi.fn());
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults to the first category once observed', () => {
    document.body.innerHTML = '<div id="pizzas"></div><div id="bebidas"></div>';
    const { result } = renderHook(() =>
      useActiveCategory({ categories: ['Pizzas', 'Bebidas'], slugify }),
    );
    expect(result.current.activeCategory).toBe('Pizzas');
  });

  it('returns empty activeCategory when there are no categories', () => {
    const { result } = renderHook(() => useActiveCategory({ categories: [], slugify }));
    expect(result.current.activeCategory).toBe('');
  });

  it('selectCategory scrolls the target section into view', () => {
    document.body.innerHTML = '<div id="bebidas"></div>';
    const target = document.getElementById('bebidas')!;
    const spy = vi.spyOn(target, 'scrollIntoView');
    const { result } = renderHook(() =>
      useActiveCategory({ categories: ['Pizzas', 'Bebidas'], slugify }),
    );
    act(() => result.current.selectCategory('Bebidas'));
    expect(spy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(result.current.activeCategory).toBe('Bebidas');
  });

  it('selectCategory is a no-op when the target section is missing', () => {
    document.body.innerHTML = '';
    const { result } = renderHook(() => useActiveCategory({ categories: ['Pizzas'], slugify }));
    expect(() => act(() => result.current.selectCategory('Pizzas'))).not.toThrow();
  });

  it('exposes navRef and pillListRef for callers to attach', () => {
    const { result } = renderHook(() => useActiveCategory({ categories: ['Pizzas'], slugify }));
    expect(result.current.navRef.current).toBeNull();
    expect(result.current.pillListRef.current).toBeNull();
  });
});
