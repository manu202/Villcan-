// Shared across MovementForm.tsx (parent, for state typing) and
// DetailsStep.tsx (gasto's "Origen" selector). Extracted here because it's
// genuinely reused by more than one file — everything else step-specific
// stays local to its own step file.
export const fuentes = ['Caja', 'Cta Bancaria'] as const;
