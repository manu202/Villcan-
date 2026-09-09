// Global test setup. @testing-library/react registers its own afterEach
// cleanup automatically when a global test framework (vitest globals) is detected.

// jsdom does not implement IntersectionObserver — used by the storefront's
// category scroll-spy (see useActiveCategory / GastronomyTemplate). Without
// this stub, any component that mounts an observer in a passive effect
// throws "IntersectionObserver is not defined" during tests.
class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
globalThis.IntersectionObserver = IntersectionObserverStub;

// jsdom does not implement ResizeObserver either — used by the storefront's
// sticky-nav height measurement.
class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;

// jsdom does not implement Element.scrollIntoView — used by the storefront's
// category scroll-spy to keep the active pill visible in the horizontal nav.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom's canvas element has no real rendering backend: getContext('2d')
// returns null. GastronomyTemplate's FireCanvas reads/writes ImageData every
// animation frame — stub just enough of the 2D context surface so mounting
// it in tests doesn't throw. This does NOT verify the fire simulation renders
// correctly (that needs a real browser); it only lets components using
// <canvas> mount without crashing.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = ((contextId: string) => {
    if (contextId !== '2d') return null;
    return {
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
        colorSpace: 'srgb' as PredefinedColorSpace,
      }),
      putImageData: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
        colorSpace: 'srgb' as PredefinedColorSpace,
      }),
      clearRect: () => {},
      fillRect: () => {},
      drawImage: () => {},
      scale: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
    };
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
