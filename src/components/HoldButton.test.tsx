import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HoldButton } from './HoldButton';

describe('HoldButton — layout', () => {
  it('muestra el label por defecto', () => {
    render(<HoldButton label="Confirmar cierre" onConfirm={vi.fn()} />);
    expect(screen.getByText('Confirmar cierre')).toBeTruthy();
  });

  it('muestra el holdLabel mientras se mantiene presionado', () => {
    render(
      <HoldButton label="Confirmar cierre" holdLabel="Mantené..." onConfirm={vi.fn()} />
    );
    const btn = screen.getByRole('button');
    fireEvent.mouseDown(btn);
    expect(screen.getByText('Mantené...')).toBeTruthy();
    fireEvent.mouseUp(btn);
  });

  it('muestra el label original cuando se suelta antes de completar', () => {
    render(<HoldButton label="Confirmar cierre" holdLabel="Mantené..." onConfirm={vi.fn()} />);
    const btn = screen.getByRole('button');
    fireEvent.mouseDown(btn);
    fireEvent.mouseUp(btn);
    expect(screen.getByText('Confirmar cierre')).toBeTruthy();
  });
});

describe('HoldButton — confirmación', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('llama onConfirm después de mantener presionado la duración completa', async () => {
    const onConfirm = vi.fn();
    render(<HoldButton label="Confirmar" onConfirm={onConfirm} duration={1500} />);
    const btn = screen.getByRole('button');

    fireEvent.mouseDown(btn);
    await act(async () => { vi.advanceTimersByTime(1500); });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('NO llama onConfirm si se suelta antes de la duración', async () => {
    const onConfirm = vi.fn();
    render(<HoldButton label="Confirmar" onConfirm={onConfirm} duration={1500} />);
    const btn = screen.getByRole('button');

    fireEvent.mouseDown(btn);
    await act(async () => { vi.advanceTimersByTime(800); });
    fireEvent.mouseUp(btn);
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('el progreso vuelve a 0 al soltar antes de completar', async () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <HoldButton label="Confirmar" onConfirm={onConfirm} duration={1500} />
    );
    const btn = screen.getByRole('button');

    fireEvent.mouseDown(btn);
    await act(async () => { vi.advanceTimersByTime(800); });
    fireEvent.mouseUp(btn);

    const progress = container.querySelector('[data-testid="hold-progress"]');
    expect(progress?.getAttribute('data-progress')).toBe('0');
  });
});

describe('HoldButton — touch events', () => {
  it('funciona con touchstart / touchend', async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<HoldButton label="Confirmar" onConfirm={onConfirm} duration={1000} />);
    const btn = screen.getByRole('button');

    fireEvent.touchStart(btn);
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('HoldButton — disabled', () => {
  it('no llama onConfirm cuando está disabled', async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<HoldButton label="Confirmar" onConfirm={onConfirm} duration={500} disabled />);
    const btn = screen.getByRole('button');

    fireEvent.mouseDown(btn);
    await act(async () => { vi.advanceTimersByTime(600); });

    expect(onConfirm).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
