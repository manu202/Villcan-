-- Seed: productos Tatapiriri
-- Ejecutar en: https://supabase.com/dashboard/project/vjgdtxryudoscumwsjhs/sql/new
--
-- Desactiva todos los servicios existentes del branch y luego inserta
-- los 17 productos reales en sus 4 categorías.

DO $$
DECLARE
  v_bid uuid;
BEGIN
  SELECT id INTO v_bid FROM branches WHERE slug = 'tatapiriri' LIMIT 1;

  IF v_bid IS NULL THEN
    RAISE EXCEPTION 'Branch tatapiriri no encontrado. Verificá que el slug esté correcto en la tabla branches.';
  END IF;

  -- Desactivar servicios anteriores (preserva historial de órdenes)
  UPDATE services
  SET is_active = false, is_available = false
  WHERE branch_id = v_bid;

  -- ── PIZZAS ──────────────────────────────────────────────────────────────
  INSERT INTO services (branch_id, name, description, price, category, is_active, is_available, cost) VALUES
  (v_bid, 'Mozzarella',
   'Base blanca, reducción de tomate, mozzarella y pesto de albahaca fresca.',
   55000, 'Pizzas', true, true, 0),

  (v_bid, 'Rúcula',
   'Salsa de tomate casera, mozzarella, ricota cremosa y hojas de rúcula fresca.',
   55000, 'Pizzas', true, true, 0),

  (v_bid, 'Nórdica',
   'Salsa de tomate, mozzarella, cebolla en juliana y panceta de doble cocción.',
   60000, 'Pizzas', true, true, 0),

  (v_bid, 'Morrones y Panceta',
   'Salsa de tomate, mozzarella, reducción de morrones asados (verdes y rojos) y panceta de doble cocción.',
   60000, 'Pizzas', true, true, 0),

  (v_bid, 'Pepperoni',
   'Salsa de tomate, mozzarella y rodajas de pepperoni artesanal.',
   65000, 'Pizzas', true, true, 0),

  (v_bid, 'Napolitana',
   'Salsa de tomate, rodajas de tomate fresco, pesto de aceitunas y orégano.',
   65000, 'Pizzas', true, true, 0),

  (v_bid, 'Falsa Carbonara',
   'Base blanca, mozzarella, panceta de doble cocción, yema de huevo, parmesano reggianito y pimienta negra recién molida.',
   70000, 'Pizzas', true, true, 0),

  (v_bid, 'Chipa Guazú',
   'Base blanca con mozzarella, cebolla en juliana, granos de maíz tostado y queso catupiry.',
   70000, 'Pizzas', true, true, 0),

  (v_bid, 'Catupiry y Pollo',
   'Salsa de tomate, mozzarella, pollo desmechado a la cerveza, suave queso catupiry y orégano.',
   75000, 'Pizzas', true, true, 0),

  -- ── TOSCANAZOS ──────────────────────────────────────────────────────────
  (v_bid, 'Toscanazo 3 Salsas',
   'Chorizo toscano de finas hierbas en pan recién horneado con mayo de ajo, mostaza y salsa BBQ.',
   30000, 'Toscanazos', true, true, 0),

  (v_bid, 'Toscanazo Con Verduras',
   'Chorizo toscano de finas hierbas en pan recién horneado con mayo de ajo, mix de verduras asadas y salsa BBQ.',
   30000, 'Toscanazos', true, true, 0),

  (v_bid, 'Toscanazo Morrones y Panceta',
   'Chorizo toscano de finas hierbas en pan recién horneado con mayo de ajo, mix de verduras asadas y panceta de doble cocción.',
   35000, 'Toscanazos', true, true, 0),

  (v_bid, 'Toscanazo Con Papas Pay',
   'Chorizo toscano de finas hierbas en pan recién horneado con mayo de ajo, mix de verduras, salsa BBQ, panceta de doble cocción y papas pay.',
   35000, 'Toscanazos', true, true, 0),

  (v_bid, 'Toscanazo Jaguareté',
   'Chorizo toscano de finas hierbas en pan recién horneado con ensalada de col y zanahoria, mayo picante, salsa de tomate y verdeo.',
   35000, 'Toscanazos', true, true, 0),

  -- ── PANINIS ─────────────────────────────────────────────────────────────
  (v_bid, 'Panini de Pollo',
   'Sandwich en pan de pizza. Pollo desmechado cocinado en cerveza rubia y especias, salsa de ajo, BBQ y rúcula.',
   40000, 'Paninis', true, true, 0),

  -- ── PROMOS ──────────────────────────────────────────────────────────────
  (v_bid, 'Martes de Complicidad',
   '2 pizzas clásicas para compartir. Solo los martes, solo en el local.',
   100000, 'Promos', true, true, 0),

  (v_bid, '2 Paninis de Pollo',
   'Llevate 2 paninis de pollo al precio combo.',
   59000, 'Promos', true, true, 0);

  RAISE NOTICE '✓ Seed completado: 17 productos para branch % (%)', 'tatapiriri', v_bid;
END $$;
