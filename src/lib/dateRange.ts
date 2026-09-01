// Shared date-range logic for period toggles across the app (dashboard +
// reports). Extracted from src/app/reports/page.tsx so "Semana"/"Mes" mean
// exactly the same thing everywhere — do not fork this logic per screen.

export type ViewType = 'today' | 'week' | 'month' | 'custom' | 'all';

export const getDateRange = (
  view: ViewType,
  customRange?: { from: string; to: string }
): { start: string; end: string } => {
  const now = new Date();

  switch (view) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'week': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'custom': {
      if (!customRange?.from || !customRange?.to) {
        return { start: '', end: '' };
      }
      const start = new Date(customRange.from);
      const end = new Date(customRange.to);
      end.setDate(end.getDate() + 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'all':
    default:
      return { start: '2000-01-01', end: '2100-01-01' };
  }
};
