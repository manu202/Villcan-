-- Orders ↔ Movements financial link
--
-- Adds:
--   movements.order_id — FK to orders, nullable, SET NULL on delete
--   unique partial index — one movement per order (idempotency)
--   movement_items — item-level breakdown for back-office direct sales
--   fn_order_completed_to_movement + trg_order_completed_to_movement
--     AFTER UPDATE OF status ON orders → fires when status changes to 'completed'
--
-- No backfill — only new orders from this migration forward get a linked movement.
-- Rollback at the bottom.

-- ============================================================================
-- 1. order_id FK on movements
-- ============================================================================

ALTER TABLE public.movements
  ADD COLUMN order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. Unique partial index — one movement per completed order
-- ============================================================================

CREATE UNIQUE INDEX idx_movements_order_id_unique
  ON public.movements(order_id)
  WHERE order_id IS NOT NULL;

-- ============================================================================
-- 3. movement_items — item breakdown for back-office direct multi-service sales
-- ============================================================================

CREATE TABLE public.movement_items (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  movement_id uuid NOT NULL REFERENCES public.movements(id) ON DELETE CASCADE,
  name_snapshot text NOT NULL,
  qty         integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price  integer NOT NULL CHECK (unit_price >= 0),
  line_total  integer NOT NULL CHECK (line_total >= 0),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.movement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movement_items: read for branch members"
  ON public.movement_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.movements m
      JOIN public.user_branch_access uba ON uba.branch_id = m.branch_id
      WHERE m.id = movement_items.movement_id
        AND uba.user_id = auth.uid()
    )
  );

CREATE POLICY "movement_items: insert for branch members"
  ON public.movement_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.movements m
      JOIN public.user_branch_access uba ON uba.branch_id = m.branch_id
      WHERE m.id = movement_items.movement_id
        AND uba.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. Trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_order_completed_to_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id   uuid;
  v_movement_id uuid;
BEGIN
  -- Only fire when status changes TO 'completed'
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_user_id := auth.uid();

  -- Requires an authenticated context — skip silently if not available
  -- (e.g. service-role admin operations; those are not user-facing completions)
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency: skip if a movement already exists for this order
  IF EXISTS (SELECT 1 FROM public.movements WHERE order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.movements (
    type, amount_charged, income, expense,
    payment_method, contact_id, service_id,
    user_id, branch_id, comment, order_id
  ) VALUES (
    'servicio',
    NEW.total,
    NEW.total,
    0,
    NEW.payment_method,
    NEW.contact_id,
    NULL,
    v_user_id,
    NEW.branch_id,
    'Pedido ' || NEW.order_code,
    NEW.id
  )
  RETURNING id INTO v_movement_id;

  -- Copy order_items → movement_items for full item breakdown
  INSERT INTO public.movement_items (movement_id, name_snapshot, qty, unit_price, line_total)
  SELECT v_movement_id, oi.name_snapshot, oi.qty, oi.unit_price, oi.line_total
  FROM public.order_items oi
  WHERE oi.order_id = NEW.id;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. Trigger
-- ============================================================================

CREATE TRIGGER trg_order_completed_to_movement
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_order_completed_to_movement();

-- ============================================================================
-- Rollback (manual):
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_order_completed_to_movement ON public.orders;
-- DROP FUNCTION IF EXISTS public.fn_order_completed_to_movement();
-- DROP TABLE IF EXISTS public.movement_items;
-- DROP INDEX IF EXISTS idx_movements_order_id_unique;
-- ALTER TABLE public.movements DROP COLUMN IF EXISTS order_id;
