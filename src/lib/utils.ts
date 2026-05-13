import type { PaymentMethod, MovementType } from '@/types';

/**
 * Format a number as Guaranies (₲)
 * Example: 35000 → "₲ 35.000"
 */
export function formatGuaranies(amount: number): string {
  return `₲ ${amount.toLocaleString('es-PY')}`;
}

/**
 * Parse a Guaranies formatted string to number
 * Handles inputs like "35.000" or "35000"
 */
export function parseGuaranies(value: string): number {
  const cleaned = value.replace(/[₲.\s]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

/**
 * Format date for display (DD/MM/YYYY)
 */
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format time for display (HH:MM)
 */
export function formatTime(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString('es-PY', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get human-readable label for movement type
 */
export function getMovementTypeLabel(type: MovementType): string {
  const labels: Record<MovementType, string> = {
    servicio: 'Servicio',
    gasto: 'Gasto',
    apertura: 'Apertura',
    cierre: 'Cierre',
  };
  return labels[type];
}

/**
 * Get human-readable label for payment method
 */
export function getPaymentMethodLabel(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    pos: 'POS',
  };
  return labels[method];
}

/**
 * Calculate net amount from income/expense
 */
export function calculateNet(income: number, expense: number): number {
  return income - expense;
}

/**
 * Get today's date range (start and end of day in ISO format)
 */
export function getTodayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Classify movement as income/expense/neutral
 */
export function getMovementFlow(
  type: MovementType,
  income: number,
  expense: number
): 'income' | 'expense' | 'transfer' {
  if (type === 'servicio') return 'income';
  if (type === 'gasto') return 'expense';
  // apertura and cierre are transfers (move money between accounts)
  return 'transfer';
}