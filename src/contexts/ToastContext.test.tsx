import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastContext';

function Consumer({ message }: { message: string }) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast(message, 'success')}>fire</button>
  );
}

describe('ToastContext', () => {
  it('a toast shown by one consumer is rendered by the shared ToastProvider', async () => {
    render(
      <ToastProvider>
        <Consumer message="Movimiento registrado" />
      </ToastProvider>
    );

    screen.getByText('fire').click();

    expect(await screen.findByText('Movimiento registrado')).toBeTruthy();
  });

  it('useToast() throws when called outside ToastProvider', () => {
    const { result } = renderHook(() => {
      try {
        useToast();
        return null;
      } catch (err) {
        return err as Error;
      }
    });

    expect(result.current).toBeInstanceOf(Error);
  });
});
