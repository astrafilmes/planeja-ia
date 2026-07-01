-- Backfill contrato_itens.valor_unitario/valor_total from m2a_itens when missing
UPDATE public.contrato_itens ci
   SET valor_unitario = mi.valor_unitario,
       valor_total = round((ci.quantidade * mi.valor_unitario)::numeric, 4)
  FROM public.m2a_itens mi, public.contratos c
 WHERE c.id = ci.contrato_id
   AND c.deleted_at IS NULL
   AND ci.m2a_item_id IS NOT NULL
   AND ci.m2a_item_id = mi.m2a_item_id
   AND (ci.valor_unitario IS NULL OR ci.valor_unitario = 0)
   AND mi.valor_unitario IS NOT NULL
   AND mi.valor_unitario > 0;

-- Also fix in-flight import previews
UPDATE public.contrato_import_itens cii
   SET valor_unitario = mi.valor_unitario
  FROM public.m2a_itens mi
 WHERE cii.m2a_item_id IS NOT NULL
   AND cii.m2a_item_id = mi.m2a_item_id
   AND (cii.valor_unitario IS NULL OR cii.valor_unitario = 0)
   AND mi.valor_unitario IS NOT NULL
   AND mi.valor_unitario > 0;