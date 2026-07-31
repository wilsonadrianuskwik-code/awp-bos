-- One-time historical data import: Purchase Orders and Proforma
-- Invoices (imported as Invoices, per product decision) recovered from
-- PT Andalan Warna Prima's old PDF/DOCX records, extracted into
-- Item_Detail.xlsx and reconciled here.
--
-- Deliberately NOT routed through create_purchase_order/create_invoice
-- or generate_document_number(): those RPCs mint a NEW number from the
-- live numbering template and increment document_number_counters. This
-- migration inserts historical rows directly with their ORIGINAL number
-- strings preserved as-is, so the live counter for brand-new documents
-- is completely untouched -- no collision, no gap, no reset.
--
-- Status: every historical document is stamped as fully resolved (POs
-- -> 'received', Invoices -> 'paid', amount_paid = total) per an
-- explicit instruction that all of this historical business is closed,
-- not an inference from the source data (which carries no status
-- field at all).
--
-- Reconciliation applied before writing this file (see the accompanying
-- Python script, not shipped in the repo):
--   * 7 documents had SUBTOTAL/TAX/SHIPPING/GRANDTOTAL baked into the
--     line items by the extraction tool; those are split out into this
--     document's header totals, and a nonzero SHIPPING becomes a real
--     "Shipping" line item so the value isn't lost.
--   * Supplier/customer name variants collapsed to one canonical
--     spelling: "Nippon Paint Pekanbaru" (was also seen as "NIPPON
--     PAINT PEKANBARU" / "NIPPON PEKANBARU") and "Pak Putra" (was also
--     "PAK PUTRA").
--   * A handful of rows had the Supplier/Customer columns swapped by
--     the extraction tool; resolved using each document type's actual
--     shape (a Purchase Order only ever has a supplier; an Invoice's
--     counterparty is always the client, never "PT Andalan Warna
--     Prima" itself).
--   * One line (PO AWP-P/26042025-21) had a quantity of 1 that
--     contradicted its own total (192,000 x 1 =/= 211,200,000); the
--     description text ("...1100 CAN") confirms the real quantity was
--     1100, corrected here.
--   * 4 documents were extracted twice from two source files each (a
--     .pdf and a .docx of the same document, or an original + revision)
--     under the identical document number, with identical line items --
--     kept once, not imported twice.
--   * PO AWP-P/28022025-12 held TWO genuinely different purchase orders
--     (different suppliers' worth of line items) under one shared
--     number -- a source data-entry mistake. Split into two POs,
--     renumbered from each one's own source filename: PO
--     AWP-P/13022025-12 and PO AWP-P/13022025-13.
--   * PO AWP-P/14072025-36 excluded entirely: no line totals were
--     extracted at all, and its quantities/prices don't correspond to
--     any sane unit economics (330,000 M1 of railguard at Rp
--     36,960,000/M1). The extraction failed on this one document --
--     it needs the original PO pulled up manually, not guessed at.
--
-- currency is IDR throughout -- the source data's only currency.
--
-- Every insert below is guarded by a NOT EXISTS check on the document's
-- own number, so this migration is safe to run more than once.

DO $$
DECLARE
  v_workspace_id UUID;
  v_actor_id     UUID;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting historical import';
  END IF;

  SELECT id INTO v_actor_id FROM auth.users WHERE email = 'wilsonadrianuskwik@gmail.com';
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'User wilsonadrianuskwik@gmail.com not found -- aborting historical import';
  END IF;

  -- ---------------------------------------------------------------
  -- Suppliers (only created if missing -- safe to re-run)
  -- ---------------------------------------------------------------

  INSERT INTO public.suppliers (workspace_id, name, created_by)
  SELECT v_workspace_id, 'Nippon Paint Pekanbaru', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL
  );

  INSERT INTO public.suppliers (workspace_id, name, created_by)
  SELECT v_workspace_id, 'PT SUMINSURYA MESINDOLESTARI', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE workspace_id = v_workspace_id AND name = 'PT SUMINSURYA MESINDOLESTARI' AND deleted_at IS NULL
  );

  -- ---------------------------------------------------------------
  -- Clients (only created if missing -- safe to re-run)
  -- ---------------------------------------------------------------

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'BOTANICA SPRINGHILL RESIDENCE', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'BOTANICA SPRINGHILL RESIDENCE' AND deleted_at IS NULL
  );

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'BPK. SIGIT SR', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'BPK. SIGIT SR' AND deleted_at IS NULL
  );

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'CV AURUM ZURIATAMA ANDALAN', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'CV AURUM ZURIATAMA ANDALAN' AND deleted_at IS NULL
  );

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'CV MULIA / PAK SYAHRUL', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'CV MULIA / PAK SYAHRUL' AND deleted_at IS NULL
  );

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'CV SOKI TAMELIN', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'CV SOKI TAMELIN' AND deleted_at IS NULL
  );

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'PAK EFRI PTPN', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'PAK EFRI PTPN' AND deleted_at IS NULL
  );

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'PT DUTA RAMA - PT GALA KARYA, KSO', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'PT DUTA RAMA - PT GALA KARYA, KSO' AND deleted_at IS NULL
  );

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'PT Karen Nauli', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'PT Karen Nauli' AND deleted_at IS NULL
  );

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'PT Toba Makmur Perkasa', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'PT Toba Makmur Perkasa' AND deleted_at IS NULL
  );

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'Pak Dhani / Masjid Al Hijrah', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'Pak Dhani / Masjid Al Hijrah' AND deleted_at IS NULL
  );

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'Pak Putra', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'Pak Putra' AND deleted_at IS NULL
  );

  INSERT INTO public.clients (workspace_id, name, created_by)
  SELECT v_workspace_id, 'Pak Zico Duri', v_actor_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = v_workspace_id AND name = 'Pak Zico Duri' AND deleted_at IS NULL
  );

  -- ---------------------------------------------------------------
  -- Purchase Orders
  -- ---------------------------------------------------------------

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/08012025-10' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'AWP-P/08012025-10', v_supplier_id, 'received',
        19200000, 0, 19200000, 'IDR', '2025-01-08', v_actor_id
      , ('2025-01-08'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Paint Platone 8000 3.785L 9102 White 100 Kaleng', 100, 192000, 'Kaleng', 0, 0
      , ('2025-01-08'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/09122024-03' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'AWP-P/09122024-03', v_supplier_id, 'received',
        19200000, 0, 19200000, 'IDR', '2024-12-09', v_actor_id
      , ('2024-12-09'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Paint Platone 8000 3.785L 1018 Sunshine 100 Kaleng', 100, 192000, 'Kaleng', 0, 0
      , ('2024-12-09'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/10122024-05' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'AWP-P/10122024-05', v_supplier_id, 'received',
        9600000, 0, 9600000, 'IDR', '2024-12-10', v_actor_id
      , ('2024-12-10'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Paint Platone 8000 3.785L 9102 White', 50, 192000, 'Kaleng', 0, 0
      , ('2024-12-10'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/11112024-02' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'AWP-P/11112024-02', v_supplier_id, 'received',
        33408000, 0, 33408000, 'IDR', '2024-11-11', v_actor_id
      , ('2024-11-11'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Paint Platone 8000 3.785L 1018 Sunshine 14 Kaleng', 14, 192000, 'Kaleng', 0, 0
      , ('2024-11-11'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'Nippon Paint Platone 8000 3.785L NP066 Blue 160 Kaleng', 160, 192000, 'Kaleng', 0, 0
      , ('2024-11-11'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/17122024-06' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'AWP-P/17122024-06', v_supplier_id, 'received',
        48000000, 0, 48000000, 'IDR', '2024-12-17', v_actor_id
      , ('2024-12-17'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Paint Platone 8000 3.785L 9102 White 250 Kaleng', 250, 192000, 'Kaleng', 0, 0
      , ('2024-12-17'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'AWP-P/31102024-01' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'AWP-P/31102024-01', v_supplier_id, 'received',
        57600000, 0, 57600000, 'IDR', '2024-10-31', v_actor_id
      , ('2024-10-31'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Paint Platone 8000 3.785L 1018 Sunshine', 300, 192000, NULL, 0, 0
      , ('2024-10-31'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO 001/07042026' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'PT SUMINSURYA MESINDOLESTARI' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO 001/07042026', v_supplier_id, 'received',
        54000000, 0, 54000000, 'IDR', '2026-04-07', v_actor_id
      , ('2026-04-07'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Besi As Shaft 120x1513mm', 4, 13500000, 'Pcs', 0, 0
      , ('2026-04-07'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/01072026-93' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/01072026-93', v_supplier_id, 'received',
        14000000, 0, 14000000, 'IDR', '2026-07-01', v_actor_id
      , ('2026-07-01'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP 9200F EPOXY PRIMER', 42, 200000, 'L', 0, 0
      , ('2026-07-01'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP PU HS LIGHT GREY (NON BRIGHT COLOR)', 40, 140000, 'L', 0, 0
      , ('2026-07-01'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/01082025-43' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/01082025-43', v_supplier_id, 'received',
        3800000, 0, 3800000, 'IDR', '2025-08-01', v_actor_id
      , ('2025-08-01'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX PRO 1000 BRILIANT WHITE PROJ', 10, 380000, 'PAIL', 0, 0
      , ('2025-08-01'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/01092025-60' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/01092025-60', v_supplier_id, 'received',
        3038000, 0, 3038000, 'IDR', '2025-09-01', v_actor_id
      , ('2025-09-01'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PAINT ROADLINE 268 WHITE 25KG', 2, 1519000, 'PAIL', 0, 0
      , ('2025-09-01'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02022026-76' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/02022026-76', v_supplier_id, 'received',
        22080000, 0, 22080000, 'IDR', '2026-02-02', v_actor_id
      , ('2026-02-02'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 818(600) VERMILION (PROJ)', 112, 192000, 'CAN', 0, 0
      , ('2026-02-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP123 TRAFFIC GREEN (PROJ)', 3, 192000, 'CAN', 0, 0
      , ('2026-02-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02042026-78' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/02042026-78', v_supplier_id, 'received',
        345600000, 0, 345600000, 'IDR', '2026-04-02', v_actor_id
      , ('2026-04-02'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 YELLOW SUNSHINE (PROJ)', 300, 192000, 'CAN', 0, 0
      , ('2026-04-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP066 BLUE (PROJ)', 300, 192000, 'CAN', 0, 0
      , ('2026-04-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 WHITE BS9102 (PROJ)', 300, 192000, 'CAN', 0, 0
      , ('2026-04-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NIPPON PLATONE 8000 818(600) VERMILION (PROJ)', 300, 192000, 'CAN', 0, 0
      , ('2026-04-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 5,
        'NIPPON PLATONE 8000 BS9103 SUPER BLACK (PROJ)', 300, 192000, 'CAN', 0, 0
      , ('2026-04-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 6,
        'NIPPON PLATONE 8000 NP123 TRAFFIC GREEN (PROJ)', 300, 192000, 'CAN', 0, 0
      , ('2026-04-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02072025-32' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/02072025-32', v_supplier_id, 'received',
        2480000, 0, 2480000, 'IDR', '2025-07-02', v_actor_id
      , ('2025-07-02'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'DRYMIX MORTAR NIPPONCAME PROJ', 10, 248000, 'SET', 0, 0
      , ('2025-07-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02072026-94' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/02072026-94', v_supplier_id, 'received',
        690000, 0, 690000, 'IDR', '2026-07-02', v_actor_id
      , ('2026-07-02'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP 5300 WALL SEALER PROJ', 3, 230000, 'PAIL', 0, 0
      , ('2026-07-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02092025-61' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/02092025-61', v_supplier_id, 'received',
        440000, 0, 440000, 'IDR', '2025-09-02', v_actor_id
      , ('2025-09-02'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON WALL SEALER 5200 @20KG', 1, 440000, 'PAIL', 0, 0
      , ('2025-09-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/02112025-70' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/02112025-70', v_supplier_id, 'received',
        1152000, 0, 1152000, 'IDR', '2025-11-02', v_actor_id
      , ('2025-11-02'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 BS9103 SUPER BLACK (PROJ)', 4, 192000, 'CAN', 0, 0
      , ('2025-11-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 123 TRAFFIC GREEN (PROJ)', 2, 192000, 'CAN', 0, 0
      , ('2025-11-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/03072026-95' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/03072026-95', v_supplier_id, 'received',
        13255000, 0, 13255000, 'IDR', '2026-07-03', v_actor_id
      , ('2026-07-03'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP Bee Brand 1000102S Medium Yellow (15 L)', 11, 1205000, 'PAIL', 0, 0
      , ('2026-07-03'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/04072025-33' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/04072025-33', v_supplier_id, 'received',
        74880000, 0, 74880000, 'IDR', '2025-07-04', v_actor_id
      , ('2025-07-04'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 YELLOW SUNSHINE (PROJ)', 10, 192000, 'CAN', 0, 0
      , ('2025-07-04'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP066 BLUE (PROJ)', 16, 192000, 'CAN', 0, 0
      , ('2025-07-04'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 BS9102 SUPER WHITE (PROJ)', 222, 192000, 'CAN', 0, 0
      , ('2025-07-04'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NIPPON PLATONE 8000 TRAFFIC GREEN 123 (PROJ)', 132, 192000, 'CAN', 0, 0
      , ('2025-07-04'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 5,
        'NIPPON PLATONE 8000 818(600) VERMILION (PROJ)', 10, 192000, 'CAN', 0, 0
      , ('2025-07-04'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/04072026-96' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/04072026-96', v_supplier_id, 'received',
        900000, 0, 900000, 'IDR', '2026-07-04', v_actor_id
      , ('2026-07-04'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP 5200 WALL SEALER PROJ @20KG', 2, 450000, 'PAIL', 0, 0
      , ('2026-07-04'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/05062026-87' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/05062026-87', v_supplier_id, 'received',
        11100000, 0, 11100000, 'IDR', '2026-06-05', v_actor_id
      , ('2026-06-05'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP WEATHERBOND MAX APPLE WHITE NP OW 2242 P (PROJ)', 5, 1341000, 'PAIL', 0, 0
      , ('2026-06-05'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP VINILEX APPLE WHITE NP OW 2242P (PROJ)', 3, 571000, 'PAIL', 0, 0
      , ('2026-06-05'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP WEATHERBOND MAX S1515-G20Y (PROJ)', 2, 1341000, 'PAIL', 0, 0
      , ('2026-06-05'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/05082025-44' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/05082025-44', v_supplier_id, 'received',
        114905000, 0, 114905000, 'IDR', '2025-08-05', v_actor_id
      , ('2025-08-05'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PAINT ROADLINE 268 WHITE', 70, 1519000, 'PAIL', 0, 0
      , ('2025-08-05'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PAINT ROADLINE 268 YELLOW', 4, 1715000, 'PAIL', 0, 0
      , ('2025-08-05'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PAINT ROADLINE 268 BLACK', 1, 1715000, 'PAIL', 0, 0
      , ('2025-08-05'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/05092025-62' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/05092025-62', v_supplier_id, 'received',
        6600000, 0, 6600000, 'IDR', '2025-09-05', v_actor_id
      , ('2025-09-05'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX 2002 BRILIANT WHITE PROJ @25kg', 12, 550000, 'PAIL', 0, 0
      , ('2025-09-05'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/06052026-82' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/06052026-82', v_supplier_id, 'received',
        1440384000, 0, 1440384000, 'IDR', '2026-05-06', v_actor_id
      , ('2026-05-06'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 YELLOW SUNSHINE (PROJ)', 1332, 192000, 'CAN', 0, 0
      , ('2026-05-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP066 BLUE (PROJ)', 1312, 192000, 'CAN', 0, 0
      , ('2026-05-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 WHITE BS9102 (PROJ)', 1744, 192000, 'CAN', 0, 0
      , ('2026-05-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NIPPON PLATONE 8000 818(600) VERMILION (PROJ)', 1041, 192000, 'CAN', 0, 0
      , ('2026-05-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 5,
        'NIPPON PLATONE 8000 BS9103 SUPER BLACK (PROJ)', 883, 192000, 'CAN', 0, 0
      , ('2026-05-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 6,
        'NIPPON PLATONE 8000 NP123 T RAFFIC GREEN (PROJ)', 1190, 192000, 'CAN', 0, 0
      , ('2026-05-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/06072026-97' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/06072026-97', v_supplier_id, 'received',
        1660000, 0, 1660000, 'IDR', '2026-07-06', v_actor_id
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Spotles OW 1083 Reticent White tinting', 1, 1210000, 'PAIL', 0, 0
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP 5200 Wall Sealer PROJ', 1, 450000, 'PAIL', 0, 0
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/06072026-98' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/06072026-98', v_supplier_id, 'received',
        34150000, 0, 34150000, 'IDR', '2026-07-06', v_actor_id
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP WEATHERBOND MAX NP2027 TERAKOTA SR', 26, 1225000, 'PAIL', 0, 0
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP PLATONE 8000 NP 601 INTERNATIONAL', 10, 230000, 'GLN', 0, 0
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/07052025-23' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/07052025-23', v_supplier_id, 'received',
        1800000, 198000, 1998000, 'IDR', '2025-05-07', v_actor_id
      , ('2025-05-07'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX AUTUMN WHITE NP OW 1027P 25KG', 3, 600000, 'PAIL', 0, 0
      , ('2025-05-07'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/07082025-45' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/07082025-45', v_supplier_id, 'received',
        2640000, 0, 2640000, 'IDR', '2025-08-07', v_actor_id
      , ('2025-08-07'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON WALL SEALER 5200 @20KG', 6, 440000, 'PAIL', 0, 0
      , ('2025-08-07'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08052025-24' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/08052025-24', v_supplier_id, 'received',
        16128000, 0, 16128000, 'IDR', '2025-05-08', v_actor_id
      , ('2025-05-08'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 YELLOW SUNCHINE (PROJ)', 6, 192000, 'CAN', 0, 0
      , ('2025-05-08'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 BS9103 SUPER BLACK (PROJ)', 78, 192000, 'CAN', 0, 0
      , ('2025-05-08'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08052025-25' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/08052025-25', v_supplier_id, 'received',
        3840000, 0, 3840000, 'IDR', '2025-05-08', v_actor_id
      , ('2025-05-08'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP066 (BLUE)', 20, 192000, 'CAN', 0, 0
      , ('2025-05-08'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08072025-34' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/08072025-34', v_supplier_id, 'received',
        3000000, 0, 3000000, 'IDR', '2025-07-08', v_actor_id
      , ('2025-07-08'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX AUTUMN WHITE NP OW 1027P 25KG', 5, 600000, 'PAIL', 0, 0
      , ('2025-07-08'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08072026-99' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/08072026-99', v_supplier_id, 'received',
        2420000, 0, 2420000, 'IDR', '2026-07-08', v_actor_id
      , ('2026-07-08'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Spotles OW 1083 Reticent White tinting', 2, 1210000, 'PAIL', 0, 0
      , ('2026-07-08'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08082025-46' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/08082025-46', v_supplier_id, 'received',
        25823000, 0, 25823000, 'IDR', '2025-08-08', v_actor_id
      , ('2025-08-08'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PAINT ROADLINE 268 WHITE 25KG', 17, 1519000, 'PAIL', 0, 0
      , ('2025-08-08'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08092025-63' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/08092025-63', v_supplier_id, 'received',
        1520000, 167200, 1687200, 'IDR', '2025-09-08', v_actor_id
      , ('2025-09-08'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX PRO 1000 BRILIANT WHITE PROJ', 4, 380000, 'PAIL', 0, 0
      , ('2025-09-08'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/08112025-71' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/08112025-71', v_supplier_id, 'received',
        380000, 41800, 421800, 'IDR', '2025-11-08', v_actor_id
      , ('2025-11-08'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX PRO 1000 BRILIANT WHITE PROJ', 1, 380000, 'PAIL', 0, 0
      , ('2025-11-08'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/09082025-47' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/09082025-47', v_supplier_id, 'received',
        5500000, 0, 5500000, 'IDR', '2025-08-09', v_actor_id
      , ('2025-08-09'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX 2002 BRILIANT WHITE PROJ @25kg', 10, 550000, 'PAIL', 0, 0
      , ('2025-08-09'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/09122025-73' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/09122025-73', v_supplier_id, 'received',
        10176000, 0, 10176000, 'IDR', '2025-12-09', v_actor_id
      , ('2025-12-09'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 123 TRAFFIC GREEN (PROJ)', 53, 192000, 'CAN', 0, 0
      , ('2025-12-09'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/10072025-35' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/10072025-35', v_supplier_id, 'received',
        3800000, 418000, 4218000, 'IDR', '2025-07-10', v_actor_id
      , ('2025-07-10'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX PRO 1000 BRILIANT WHITE PROJ', 10, 380000, 'PAIL', 0, 0
      , ('2025-07-10'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/11062025-28' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/11062025-28', v_supplier_id, 'received',
        114624000, 0, 114624000, 'IDR', '2025-06-11', v_actor_id
      , ('2025-06-11'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 BS9103 SUPER BLACK 5KG (PROJ)', 22, 192000, 'CAN', 0, 0
      , ('2025-06-11'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP 1018 YELLOW SUNSHINE 5KG (PROJ)', 381, 192000, 'CAN', 0, 0
      , ('2025-06-11'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 NP066 BLUE 5KG (PROJ)', 94, 192000, 'CAN', 0, 0
      , ('2025-06-11'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NIPPON PLATONE 8000 818(600) V ERMILION (PROJ)', 100, 192000, 'CAN', 0, 0
      , ('2025-06-11'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/12032025-16' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/12032025-16', v_supplier_id, 'received',
        1536000, 0, 1536000, 'IDR', '2025-03-12', v_actor_id
      , ('2025-03-12'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 BS9102 SUPER WHITE (PROJ)', 4, 192000, 'CAN', 0, 0
      , ('2025-03-12'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 TRAFFIC GREEN 123 (PROJ)', 4, 192000, 'CAN', 0, 0
      , ('2025-03-12'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/12032025-17' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/12032025-17', v_supplier_id, 'received',
        57600000, 0, 57600000, 'IDR', '2025-03-12', v_actor_id
      , ('2025-03-12'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 818(600) VERMILION (PROJ)', 150, 192000, 'CAN', 0, 0
      , ('2025-03-12'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 TRAFFIC GREEN 123 (PROJ)', 150, 192000, 'CAN', 0, 0
      , ('2025-03-12'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13022025-11' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/13022025-11', v_supplier_id, 'received',
        15360000, 0, 15360000, 'IDR', '2025-02-13', v_actor_id
      , ('2025-02-13'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Paint Platone 8000 3.785L 9102 W hite', 80, 192000, 'CAN', 0, 0
      , ('2025-02-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13072026-100' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/13072026-100', v_supplier_id, 'received',
        1373266, 0, 1373266, 'IDR', '2026-07-13', v_actor_id
      , ('2026-07-13'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP 5400 WALL SEALER WHITE (PROJ)', 1, 660000, 'PAIL', 0, 0
      , ('2026-07-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP VINILEX (PROJ) N 3049 P MAMMOTH GRAY', 1, 605000, 'PAIL', 0, 0
      , ('2026-07-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP COLOURANT BLACK (B)', 1, 108266, 'UNIT', 0, 0
      , ('2026-07-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13072026-101' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/13072026-101', v_supplier_id, 'received',
        3360000, 0, 3360000, 'IDR', '2026-07-13', v_actor_id
      , ('2026-07-13'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP NIPPE 2000 SUPER BLACK 480 @1L', 32, 105000, 'CAN', 0, 0
      , ('2026-07-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13082025-48' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/13082025-48', v_supplier_id, 'received',
        27930000, 0, 27930000, 'IDR', '2025-08-13', v_actor_id
      , ('2025-08-13'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PAINT ROADLINE 268 WHITE 25KG', 15, 1519000, 'PAIL', 0, 0
      , ('2025-08-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PAINT ROADLINE 268 YELLOW 25KG', 3, 1715000, 'PAIL', 0, 0
      , ('2025-08-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13092025-64' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/13092025-64', v_supplier_id, 'received',
        6600000, 0, 6600000, 'IDR', '2025-09-13', v_actor_id
      , ('2025-09-13'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX 2002 BRILIANT WHITE PROJ @25kg', 12, 550000, 'PAIL', 0, 0
      , ('2025-09-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/14012026-74' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/14012026-74', v_supplier_id, 'received',
        1060000, 0, 1060000, 'IDR', '2026-01-14', v_actor_id
      , ('2026-01-14'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON ZINCHROMATE GRAY @5KG', 5, 212000, 'CAN', 0, 0
      , ('2026-01-14'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/14072026-102' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/14072026-102', v_supplier_id, 'received',
        9620000, 0, 9620000, 'IDR', '2026-07-14', v_actor_id
      , ('2026-07-14'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP VINILEX BRILLIANT WHITE 2002 PROJ', 15, 600000, 'PAIL', 0, 0
      , ('2026-07-14'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP VINILEX (950 PURE GREY) PROJ', 1, 620000, 'PAIL', 0, 0
      , ('2026-07-14'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/15052026-83' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/15052026-83', v_supplier_id, 'received',
        87936000, 0, 87936000, 'IDR', '2026-05-15', v_actor_id
      , ('2026-05-15'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 YELLOW SUNSHINE (PROJ)', 304, 192000, 'CAN', 0, 0
      , ('2026-05-15'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP066 BLUE (PROJ)', 3, 192000, 'CAN', 0, 0
      , ('2026-05-15'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 818(600) VERMILION (PROJ)', 2, 192000, 'CAN', 0, 0
      , ('2026-05-15'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NIPPON PLATONE 8000 BS9103 SUPER BLACK (PROJ)', 6, 192000, 'CAN', 0, 0
      , ('2026-05-15'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 5,
        'NIPPON PLATONE 8000 NP123 TRAFFIC GREEN (PROJ)', 143, 192000, 'CAN', 0, 0
      , ('2026-05-15'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/16082025-49' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/16082025-49', v_supplier_id, 'received',
        5500000, 0, 5500000, 'IDR', '2025-08-16', v_actor_id
      , ('2025-08-16'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX 2002 BRILIANT WHITE PROJ @25kg', 10, 550000, 'PAIL', 0, 0
      , ('2025-08-16'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/17062026-88 REV1' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/17062026-88 REV1', v_supplier_id, 'received',
        2775000, 0, 2775000, 'IDR', '2026-06-17', v_actor_id
      , ('2026-06-17'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP 5400 SEALER WHITE (PROJ) @20L 1 PAIL', 1, 620000, 'PAIL', 0, 0
      , ('2026-06-17'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP SPORTKOTE STANDARD COLOUR (PROJ)
@25KG', 1, 880000, 'PAIL', 0, 0
      , ('2026-06-17'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP MATEX CAT GENTENG PROJ (IMPRESSIONS
NP AC 2114A) @15L', 2, 637500, 'PAIL', 0, 0
      , ('2026-06-17'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/18062025-29' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/18062025-29', v_supplier_id, 'received',
        9968000, 0, 9968000, 'IDR', '2025-06-18', v_actor_id
      , ('2025-06-18'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 Brown 5KG', 4, 192000, 'CAN', 0, 0
      , ('2025-06-18'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON WEATHERBOND MAX 2002 BRILIANT WHITE PROJ 20L', 4, 1400000, 'PAIL', 0, 0
      , ('2025-06-18'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON VINILEX S300 PROJ 20L', 6, 600000, 'PAIL', 0, 0
      , ('2025-06-18'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/19032025-18' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/19032025-18', v_supplier_id, 'received',
        247296000, 0, 247296000, 'IDR', '2025-03-19', v_actor_id
      , ('2025-03-19'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 BS9102 SUPER WHITE (PROJ)', 5, 192000, 'CAN', 0, 0
      , ('2025-03-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP066 (BLUE)', 5, 192000, 'CAN', 0, 0
      , ('2025-03-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 BS9103 SUPER BLACK (PROJ)', 573, 192000, 'CAN', 0, 0
      , ('2025-03-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NIPPON PLATONE 8000 TRAFFIC G REEN 123 (PROJ)', 705, 192000, 'CAN', 0, 0
      , ('2025-03-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/19052026-84rev1' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/19052026-84rev1', v_supplier_id, 'received',
        359740000, 0, 359740000, 'IDR', '2026-05-19', v_actor_id
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP 5400 WALL SEALER PROJ', 20, 550000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP 5200 WALL SEALER PROJ', 166, 440000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP FLAWLESS EASY WASH N3213P WHITECHOC', 265, 800000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NP WEATHERBOND MAX N3213P WHITECHOC', 36, 1225000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 5,
        'NP WEATHERBOND MAX N3035P CLOUDS OVER', 4, 1225000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 6,
        'NP WEATHERBOND MAX NP BRILLIANT WHITE', 6, 1225000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 7,
        'NP WEATHERBOND MAX NP2027 TERAKOTA SR', 6, 1225000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/19072025-37' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/19072025-37', v_supplier_id, 'received',
        4400000, 484000, 4884000, 'IDR', '2025-07-19', v_actor_id
      , ('2025-07-19'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON WALL SEALER 5200 @ 20 KG 10 PAIL', 10, 440000, 'PAIL', 0, 0
      , ('2025-07-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/19072026-89' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/19072026-89', v_supplier_id, 'received',
        3000000, 0, 3000000, 'IDR', '2026-07-19', v_actor_id
      , ('2026-07-19'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP VINILEX BRILLIANT WHITE 2002 PROJECT', 5, 600000, 'PAIL', 0, 0
      , ('2026-07-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/19082025-50' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/19082025-50', v_supplier_id, 'received',
        24892000, 0, 24892000, 'IDR', '2025-08-19', v_actor_id
      , ('2025-08-19'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PAINT ROADLINE 268 WHITE 25KG', 13, 1519000, 'PAIL', 0, 0
      , ('2025-08-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PAINT ROADLINE 268 YELLOW 25KG', 3, 1715000, 'PAIL', 0, 0
      , ('2025-08-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/20072026-103' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/20072026-103', v_supplier_id, 'received',
        134750000, 0, 134750000, 'IDR', '2026-07-20', v_actor_id
      , ('2026-07-20'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP WEATHERBOND MAX NP2027 TERAKOTA SR', 60, 1225000, 'PAIL', 0, 0
      , ('2026-07-20'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP WEATHERBOND MAX- NP N 3035 P CLOUDS', 30, 1225000, 'PAIL', 0, 0
      , ('2026-07-20'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP WEATHERBOND MAX NP BRILLIANT WHITE', 20, 1225000, 'PAIL', 0, 0
      , ('2026-07-20'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/20082025-51' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/20082025-51', v_supplier_id, 'received',
        3080000, 0, 3080000, 'IDR', '2025-08-20', v_actor_id
      , ('2025-08-20'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON WALL SEALER 5200 @20KG', 7, 440000, 'PAIL', 0, 0
      , ('2025-08-20'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/20102025-68' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/20102025-68', v_supplier_id, 'received',
        1594000, 0, 1594000, 'IDR', '2025-10-20', v_actor_id
      , ('2025-10-20'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Paint Elastex Fiberflex PU 05 Grey PROJ @20L', 1, 894000, 'PAIL', 0, 0
      , ('2025-10-20'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON WALL SEALER 8100 WEATHERBOND@ 20 KG PROJ', 1, 700000, 'PAIL', 0, 0
      , ('2025-10-20'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/21052026-85rev1' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/21052026-85rev1', v_supplier_id, 'received',
        356850000, 0, 356850000, 'IDR', '2026-05-21', v_actor_id
      , ('2026-05-21'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP 5400 WALL SEALER PROJ', 20, 550000, 'PAIL', 0, 0
      , ('2026-05-21'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP 5200 WALL SEALER PROJ', 165, 440000, 'PAIL', 0, 0
      , ('2026-05-21'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP FLAWLESS EASY WASH N3213P WHITECHOC', 265, 800000, 'PAIL', 0, 0
      , ('2026-05-21'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NP WEATHERBOND MAX N3213P WHITECHOC', 36, 1225000, 'PAIL', 0, 0
      , ('2026-05-21'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 5,
        'NP WEATHERBOND MAX N3035P CLOUDS OVER', 4, 1225000, 'PAIL', 0, 0
      , ('2026-05-21'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 6,
        'NP WEATHERBOND MAX NP BRILLIANT WHITE', 5, 1225000, 'PAIL', 0, 0
      , ('2026-05-21'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 7,
        'NP WEATHERBOND MAX NP2027 TERAKOTA SR', 5, 1225000, 'PAIL', 0, 0
      , ('2026-05-21'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/21072025-38' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/21072025-38', v_supplier_id, 'received',
        91140000, 0, 91140000, 'IDR', '2025-07-21', v_actor_id
      , ('2025-07-21'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON ROAD LINER 268 WHITE @25 KG', 60, 1519000, 'PAIL', 0, 0
      , ('2025-07-21'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/21072026-104' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/21072026-104', v_supplier_id, 'received',
        1800000, 0, 1800000, 'IDR', '2026-07-21', v_actor_id
      , ('2026-07-21'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP VINILEX BRILLIANT WHITE 2002 PROJECT', 3, 600000, 'PAIL', 0, 0
      , ('2026-07-21'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/22052025-26' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/22052025-26', v_supplier_id, 'received',
        1152000, 0, 1152000, 'IDR', '2025-05-22', v_actor_id
      , ('2025-05-22'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 BS9103 SUPER BLACK (PROJ)', 6, 192000, 'CAN', 0, 0
      , ('2025-05-22'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/22052025-27' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/22052025-27', v_supplier_id, 'received',
        3152400, 0, 3152400, 'IDR', '2025-05-22', v_actor_id
      , ('2025-05-22'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON ROAD LINE WHITE 5 KG', 10, 315240, 'CAN', 0, 0
      , ('2025-05-22'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/22072025-39' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/22072025-39', v_supplier_id, 'received',
        1200000, 0, 1200000, 'IDR', '2025-07-22', v_actor_id
      , ('2025-07-22'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX AUTUMN WHITE NP OW 1027P 25KG', 2, 600000, 'PAIL', 0, 0
      , ('2025-07-22'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/22102025-69' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/22102025-69', v_supplier_id, 'received',
        384000, 0, 384000, 'IDR', '2025-10-22', v_actor_id
      , ('2025-10-22'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 BS9103 SUPER BLACK (PROJ)', 2, 192000, 'CAN', 0, 0
      , ('2025-10-22'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/23072026-105' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/23072026-105', v_supplier_id, 'received',
        2520000, 0, 2520000, 'IDR', '2026-07-23', v_actor_id
      , ('2026-07-23'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP PU HS RAL 9016 TRAFFIC WHITE', 5, 168000, 'L', 0, 0
      , ('2026-07-23'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP PU HS RAL 5017 TRAFFIC BLUE', 5, 168000, 'L', 0, 0
      , ('2026-07-23'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP PU HS RAL 6029 MINT GREEN', 5, 168000, 'L', 0, 0
      , ('2026-07-23'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/23082025-52' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/23082025-52', v_supplier_id, 'received',
        202000, 0, 202000, 'IDR', '2025-08-23', v_actor_id
      , ('2025-08-23'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON WASHI TAPE 002', 20, 10100, 'PCS', 0, 0
      , ('2025-08-23'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/23092025-65' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/23092025-65', v_supplier_id, 'received',
        1520000, 0, 1520000, 'IDR', '2025-09-23', v_actor_id
      , ('2025-09-23'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX PRO 1000 BRILIANT WHITE PROJ', 4, 380000, 'PAIL', 0, 0
      , ('2025-09-23'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/24032025-15' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/24032025-15', v_supplier_id, 'received',
        5952000, 0, 5952000, 'IDR', '2025-03-24', v_actor_id
      , ('2025-03-24'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 BS9102 SUPER WHITE', 25, 192000, 'CAN', 0, 0
      , ('2025-03-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP 1018 YELLOW SUNSHINE', 3, 192000, 'CAN', 0, 0
      , ('2025-03-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 NP066 BLUE', 3, 192000, 'CAN', 0, 0
      , ('2025-03-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/24042025-19' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/24042025-19', v_supplier_id, 'received',
        2400000, 264000, 2664000, 'IDR', '2025-04-24', v_actor_id
      , ('2025-04-24'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX AUTUMN WHITE NP OW 1027P 25KG', 4, 600000, 'PAIL', 0, 0
      , ('2025-04-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/24072025-40' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/24072025-40', v_supplier_id, 'received',
        700000, 0, 700000, 'IDR', '2025-07-24', v_actor_id
      , ('2025-07-24'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON WALL SEALER 8100 WEATHERBOND@ 20 KG PROJ', 1, 700000, 'PAIL', 0, 0
      , ('2025-07-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/24072026-106' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/24072026-106', v_supplier_id, 'received',
        3430000, 0, 3430000, 'IDR', '2026-07-24', v_actor_id
      , ('2026-07-24'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP 5400 WALL SEALER WHITE (PROJ)', 2, 660000, 'PAIL', 0, 0
      , ('2026-07-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP VINILEX (PROJ) N 3049 P MAMMOTH GRAY', 2, 605000, 'PAIL', 0, 0
      , ('2026-07-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP 5200 WALL SEALER WHITE (PROJ)', 2, 450000, 'PAIL', 0, 0
      , ('2026-07-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/25042025-20' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/25042025-20', v_supplier_id, 'received',
        518400000, 0, 518400000, 'IDR', '2025-04-25', v_actor_id
      , ('2025-04-25'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 1050 CAN', 1050, 192000, 'CAN', 0, 0
      , ('2025-04-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP066 (BLUE)', 550, 192000, 'CAN', 0, 0
      , ('2025-04-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 BS9102', 1100, 192000, 'CAN', 0, 0
      , ('2025-04-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/25062025-30' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/25062025-30', v_supplier_id, 'received',
        44320320, 0, 44320320, 'IDR', '2025-06-25', v_actor_id
      , ('2025-06-25'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon 8100 Weatherbond Sealer PROJ 20L', 10, 700000, 'PAIL', 0, 0
      , ('2025-06-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'Vinilex Pro 1000 PROJ 25KG', 10, 380000, 'PAIL', 0, 0
      , ('2025-06-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP ipNpuotmn eWaetsa PthReOrbJo n2d0 LM ax BGG 1697', 12, 1438910, 'PAIL', 0, 0
      , ('2025-06-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'N34ip4p3oAn LWegeaacthye Brboownnd PMRaOx JN 2P0 LA C', 10, 1625340, 'PAIL', 0, 0
      , ('2025-06-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/25062025-31' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/25062025-31', v_supplier_id, 'received',
        33520320, 0, 33520320, 'IDR', '2025-06-25', v_actor_id
      , ('2025-06-25'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Weatherbond Max BGG 1697 P Nutmeats PROJ 20L', 12, 1438910, 'PAIL', 0, 0
      , ('2025-06-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'Nippon Weatherbond Max NP AC 3443A Legacy Bown PROJ 20L', 10, 1625340, 'PAIL', 0, 0
      , ('2025-06-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/25072026-90' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/25072026-90', v_supplier_id, 'received',
        400000, 0, 400000, 'IDR', '2026-07-25', v_actor_id
      , ('2026-07-25'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP VINILEX PRO 1000 BRILLIANT WHITE PROJECT', 1, 400000, 'PAIL', 0, 0
      , ('2026-07-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/25082025-53' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/25082025-53', v_supplier_id, 'received',
        15386000, 0, 15386000, 'IDR', '2025-08-25', v_actor_id
      , ('2025-08-25'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PAINT ROADLINE 268 WHITE 25KG', 9, 1519000, 'PAIL', 0, 0
      , ('2025-08-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PAINT ROADLINE 268 YELLOW 25KG', 1, 1715000, 'PAIL', 0, 0
      , ('2025-08-25'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/26042025-21' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/26042025-21', v_supplier_id, 'received',
        211200000, 0, 211200000, 'IDR', '2025-04-26', v_actor_id
      , ('2025-04-26'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 818(600) 1100 CAN', 1100, 192000, 'CAN', 0, 0
      , ('2025-04-26'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/26082025-54' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/26082025-54', v_supplier_id, 'received',
        8250000, 0, 8250000, 'IDR', '2025-08-26', v_actor_id
      , ('2025-08-26'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX 2002 BRILIANT WHITE PROJ @25kg', 15, 550000, 'PAIL', 0, 0
      , ('2025-08-26'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/26092025-66' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/26092025-66', v_supplier_id, 'received',
        84480000, 0, 84480000, 'IDR', '2025-09-26', v_actor_id
      , ('2025-09-26'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 138 CAN', 138, 192000, 'CAN', 0, 0
      , ('2025-09-26'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP066 BLUE', 109, 192000, 'CAN', 0, 0
      , ('2025-09-26'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 TRAFFIC', 112, 192000, 'CAN', 0, 0
      , ('2025-09-26'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NIPPON PLATONE 8000 818(600)', 81, 192000, 'CAN', 0, 0
      , ('2025-09-26'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/27042026-79 Revisi' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/27042026-79 Revisi', v_supplier_id, 'received',
        384000000, 0, 384000000, 'IDR', '2026-04-27', v_actor_id
      , ('2026-04-27'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 YELLOW SUNSHINE (PROJ)', 600, 192000, 'CAN', 0, 0
      , ('2026-04-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 WHITE BS9102 (PROJ)', 500, 192000, 'CAN', 0, 0
      , ('2026-04-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 818(600) VERMILION (PROJ)', 700, 192000, 'CAN', 0, 0
      , ('2026-04-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NIPPON PLATONE 8000 NP123 TRAFFIC GREEN (PROJ)', 200, 192000, 'CAN', 0, 0
      , ('2026-04-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/27042026-80' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/27042026-80', v_supplier_id, 'received',
        721800000, 0, 721800000, 'IDR', '2026-04-27', v_actor_id
      , ('2026-04-27'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON EPOXY PENETRATING PRIMER', 1000, 77000, 'LITER', 0, 0
      , ('2026-04-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON 982SL LIGHT GREY 520', 8000, 80000, 'LITER', 0, 0
      , ('2026-04-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON 982SL TRAFFIC YELLOW 515', 60, 80000, 'LITER', 0, 0
      , ('2026-04-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/27082025-55' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/27082025-55', v_supplier_id, 'received',
        2144000, 0, 2144000, 'IDR', '2025-08-27', v_actor_id
      , ('2025-08-27'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Paint Elastex Fiberflex PU 05 Grey PROJ @20L', 1, 894000, 'PAIL', 0, 0
      , ('2025-08-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'Nippon Paint Alkali Killer Sealer White PROJ @20L', 1, 1250000, 'PAIL', 0, 0
      , ('2025-08-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/27082025-56' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/27082025-56', v_supplier_id, 'received',
        18228000, 2005080, 20233080, 'IDR', '2025-08-27', v_actor_id
      , ('2025-08-27'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PAINT ROADLINE 268 WHITE 25KG', 12, 1519000, 'PAIL', 0, 0
      , ('2025-08-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/27112025-72' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/27112025-72', v_supplier_id, 'received',
        297984000, 0, 297984000, 'IDR', '2025-11-27', v_actor_id
      , ('2025-11-27'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 316 CAN', 316, 192000, 'CAN', 0, 0
      , ('2025-11-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP066 BLUE', 259, 192000, 'CAN', 0, 0
      , ('2025-11-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 WHITE BS9102', 460, 192000, 'CAN', 0, 0
      , ('2025-11-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NIPPON PLATONE 8000 818(600)', 517, 192000, 'CAN', 0, 0
      , ('2025-11-27'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/28012026-75' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/28012026-75', v_supplier_id, 'received',
        7224000, 0, 7224000, 'IDR', '2026-01-28', v_actor_id
      , ('2026-01-28'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON NPE 2000 NP 437 PURPLE @1LTR', 25, 86000, 'CAN', 0, 0
      , ('2026-01-28'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON NPE 2000 NP 480 SUPER BLACK @1LTR', 59, 86000, 'CAN', 0, 0
      , ('2026-01-28'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13022025-12' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/13022025-12', v_supplier_id, 'received',
        1998000, 0, 1998000, 'IDR', '2025-02-13', v_actor_id
      , ('2025-02-13'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Paint Weatherbond Max 1532 P S kyblue PROJ', 1, 1998000, 'PAIL', 0, 0
      , ('2025-02-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/13022025-13' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/13022025-13', v_supplier_id, 'received',
        134400000, 0, 134400000, 'IDR', '2025-02-13', v_actor_id
      , ('2025-02-13'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP066 BLUE PROJ', 300, 192000, 'CAN', 0, 0
      , ('2025-02-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 TRAFFIC GREEN 123 PROJ', 200, 192000, 'CAN', 0, 0
      , ('2025-02-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 BS9103 S UPER BLACK PROJ', 200, 192000, 'CAN', 0, 0
      , ('2025-02-13'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/28022025-14' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/28022025-14', v_supplier_id, 'received',
        211200000, 0, 211200000, 'IDR', '2025-02-28', v_actor_id
      , ('2025-02-28'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 YELLOW SUNSHINE', 350, 192000, 'CAN', 0, 0
      , ('2025-02-28'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 BS9102 SUPER WHITE', 450, 192000, 'CAN', 0, 0
      , ('2025-02-28'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 818(600) V ERMILION', 300, 192000, 'CAN', 0, 0
      , ('2025-02-28'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/28042025-22' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/28042025-22', v_supplier_id, 'received',
        1260000, 0, 1260000, 'IDR', '2025-04-28', v_actor_id
      , ('2025-04-28'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'Nippon Paint Zinchromate Primer Green', 2, 630000, 'PAIL', 0, 0
      , ('2025-04-28'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/28082025-57' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/28082025-57', v_supplier_id, 'received',
        1152000, 0, 1152000, 'IDR', '2025-08-28', v_actor_id
      , ('2025-08-28'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 YELLOW SUNSHINE (PROJ)', 6, 192000, 'CAN', 0, 0
      , ('2025-08-28'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29052026-86' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/29052026-86', v_supplier_id, 'received',
        2400000, 0, 2400000, 'IDR', '2026-05-29', v_actor_id
      , ('2026-05-29'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP VINILEX BRILLIANT WHITE 2002 PROJECT', 4, 600000, 'PAIL', 0, 0
      , ('2026-05-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29062026-91REV2' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/29062026-91REV2', v_supplier_id, 'received',
        23840000, 0, 23840000, 'IDR', '2026-06-29', v_actor_id
      , ('2026-06-29'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP 9200 F', 52, 200000, 'L', 0, 0
      , ('2026-06-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP PU HS RAL 2010 SIGNAL ORANGE', 15, 168000, 'L', 0, 0
      , ('2026-06-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP PU HS RAL 9016 TRAFFIC WHITE', 5, 168000, 'L', 0, 0
      , ('2026-06-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NP PU HS RAL 1023 TRAFFIC YELLOW', 5, 168000, 'L', 0, 0
      , ('2026-06-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 5,
        'NP PU HS RAL 5017 TRAFFIC BLUE', 30, 168000, 'L', 0, 0
      , ('2026-06-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 6,
        'NP PU HS RAL 6029 MINT GREEN', 20, 168000, 'L', 0, 0
      , ('2026-06-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 7,
        'THINNER 2K01', 15, 56000, 'L', 0, 0
      , ('2026-06-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29072025-41' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/29072025-41', v_supplier_id, 'received',
        600000, 0, 600000, 'IDR', '2025-07-29', v_actor_id
      , ('2025-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX AUTUMN WHITE NP OW 1027P 25KG', 1, 600000, 'PAIL', 0, 0
      , ('2025-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29072026-107' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/29072026-107', v_supplier_id, 'received',
        6355000, 0, 6355000, 'IDR', '2026-07-29', v_actor_id
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP 5400 WALL SEALER WHITE (PROJ)', 3, 660000, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP VINILEX (PROJ) N 3049 P MAMMOTH GRAY', 3, 605000, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP 5200 WALL SEALER WHITE (PROJ)', 3, 450000, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NP VINILEX (PROJ) OW 1088 P GENTEEL', 2, 605000, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29072026-108' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/29072026-108', v_supplier_id, 'received',
        97480000, 0, 97480000, 'IDR', '2026-07-29', v_actor_id
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP 5400 WALL SEALER PROJ', 50, 550000, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NP WEATHERBOND MAX N3213P WHITECHOC BREAD PROJ', 50, 1225000, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NP WEATHERBOND MAX NP2027 TERAKOTA SR PROJ', 6, 1225000, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NP PLATONE 8000 NP 601 INTERNATIONAL ORANGE PROJ', 6, 230000, 'GLN', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29082025-58' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/29082025-58', v_supplier_id, 'received',
        9310000, 0, 9310000, 'IDR', '2025-08-29', v_actor_id
      , ('2025-08-29'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PAINT ROADLINE 268 WHITE 25KG', 5, 1519000, 'PAIL', 0, 0
      , ('2025-08-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PAINT ROADLINE 268 YELLOW 25KG', 1, 1715000, 'PAIL', 0, 0
      , ('2025-08-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/29092025-67' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/29092025-67', v_supplier_id, 'received',
        1152000, 0, 1152000, 'IDR', '2025-09-29', v_actor_id
      , ('2025-09-29'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP066 BLUE', 6, 192000, 'CAN', 0, 0
      , ('2025-09-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/30042026-81' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/30042026-81', v_supplier_id, 'received',
        384000000, 0, 384000000, 'IDR', '2026-04-30', v_actor_id
      , ('2026-04-30'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 YELLOW SUNSHINE (PROJ)', 600, 192000, 'CAN', 0, 0
      , ('2026-04-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 WHITE BS9102 (PROJ)', 500, 192000, 'CAN', 0, 0
      , ('2026-04-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 818(600) VERMILION (PROJ)', 700, 192000, 'CAN', 0, 0
      , ('2026-04-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NIPPON PLATONE 8000 NP123 TRAFFIC GREEN (PROJ)', 200, 192000, 'CAN', 0, 0
      , ('2026-04-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/30062026-92' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/30062026-92', v_supplier_id, 'received',
        61250000, 0, 61250000, 'IDR', '2026-06-30', v_actor_id
      , ('2026-06-30'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NP WEATHERBOND MAX NP BRILLIANT WHITE', 50, 1225000, 'PAIL', 0, 0
      , ('2026-06-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/30072025-42' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/30072025-42', v_supplier_id, 'received',
        5500000, 0, 5500000, 'IDR', '2025-07-30', v_actor_id
      , ('2025-07-30'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX 2002 BRILIANT WHITE PROJ @25kg', 10, 550000, 'PAIL', 0, 0
      , ('2025-07-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/30082025-59' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/30082025-59', v_supplier_id, 'received',
        5500000, 0, 5500000, 'IDR', '2025-08-30', v_actor_id
      , ('2025-08-30'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON VINILEX 2002 BRILIANT WHITE PROJ @25kg', 10, 550000, 'PAIL', 0, 0
      , ('2025-08-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_po_id UUID; v_supplier_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE workspace_id = v_workspace_id AND po_number = 'PO AWP-P/31032026-77' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_supplier_id FROM public.suppliers
        WHERE workspace_id = v_workspace_id AND name = 'Nippon Paint Pekanbaru' AND deleted_at IS NULL;

      INSERT INTO public.purchase_orders (
        workspace_id, po_number, supplier_id, status,
        subtotal, tax_amount, total, currency, issue_date, created_by
      , created_at) VALUES (
        v_workspace_id, 'PO AWP-P/31032026-77', v_supplier_id, 'received',
        102912000, 0, 102912000, 'IDR', '2026-03-31', v_actor_id
      , ('2026-03-31'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_po_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 1,
        'NIPPON PLATONE 8000 NP 1018 66 CAN', 66, 192000, 'CAN', 0, 0
      , ('2026-03-31'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 2,
        'NIPPON PLATONE 8000 NP066 BLUE', 230, 192000, 'CAN', 0, 0
      , ('2026-03-31'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 3,
        'NIPPON PLATONE 8000 WHITE BS9102', 96, 192000, 'CAN', 0, 0
      , ('2026-03-31'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 4,
        'NIPPON PLATONE 8000 818(600)', 134, 192000, 'CAN', 0, 0
      , ('2026-03-31'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'purchase_order', v_po_id, 'per_unit', 5,
        'NIPPON PLATONE 8000 BS9103', 10, 192000, 'CAN', 0, 0
      , ('2026-03-31'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  -- ---------------------------------------------------------------
  -- Invoices (migrated from historical Proforma Invoice records)
  -- ---------------------------------------------------------------

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/02062026-204' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'PT DUTA RAMA - PT GALA KARYA, KSO' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/02062026-204', 'paid',
        404325000, 0, 404325000, 404325000,
        'IDR', '2026-06-02', '2026-06-02'::timestamptz, v_actor_id
      , ('2026-06-02'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP 5400 WALL SEALER PROJ', 20, 625000, 'PAIL', 0, 0
      , ('2026-06-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP 5200 WALL SEALER PROJ', 165, 500000, 'PAIL', 0, 0
      , ('2026-06-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 3,
        'NP FLAWLESS EASY WASH N3213P WHITECHOC', 265, 905000, 'PAIL', 0, 0
      , ('2026-06-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 4,
        'NP WEATHERBOND MAX N3213P WHITECHOC', 36, 1390000, 'PAIL', 0, 0
      , ('2026-06-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 5,
        'NP WEATHERBOND MAX N2047P STEEL POT PROJ', 4, 1390000, 'PAIL', 0, 0
      , ('2026-06-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 6,
        'NP WEATHERBOND MAX NP BRILLIANT WHITE', 5, 1390000, 'PAIL', 0, 0
      , ('2026-06-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 7,
        'NP WEATHERBOND MAX NP2027 TERAKOTA SR', 5, 1390000, 'PAIL', 0, 0
      , ('2026-06-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/02072026-208' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'Pak Zico Duri' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/02072026-208', 'paid',
        789000, 0, 789000, 789000,
        'IDR', '2026-07-02', '2026-07-02'::timestamptz, v_actor_id
      , ('2026-07-02'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP 5300 WALL SEALER', 3, 263000, 'PAIL', 0, 0
      , ('2026-07-02'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/03072026-209' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'PT Toba Makmur Perkasa' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/03072026-209', 'paid',
        13805000, 0, 13805000, 13805000,
        'IDR', '2026-07-03', '2026-07-03'::timestamptz, v_actor_id
      , ('2026-07-03'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP Bee Brand 1000102S Medium Yellow (15 L)', 11, 1255000, 'PAIL', 0, 0
      , ('2026-07-03'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/06072026-210' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'Pak Zico Duri' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/06072026-210', 'paid',
        980000, 0, 980000, 980000,
        'IDR', '2026-07-06', '2026-07-06'::timestamptz, v_actor_id
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP 5200 WALL SEALER PROJ @20KG', 2, 490000, 'PAIL', 0, 0
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/06072026-211' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'Pak Dhani / Masjid Al Hijrah' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/06072026-211', 'paid',
        2120000, 0, 2120000, 2120000,
        'IDR', '2026-07-06', '2026-07-06'::timestamptz, v_actor_id
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'Nippon Spotles OW 1083 Reticent White tinting', 1, 1460000, 'PAIL', 0, 0
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP 5200 Wall Sealer PROJ', 1, 660000, 'PAIL', 0, 0
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/06072026-212' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'PT DUTA RAMA - PT GALA KARYA, KSO' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/06072026-212', 'paid',
        39040000, 0, 39040000, 39040000,
        'IDR', '2026-07-06', '2026-07-06'::timestamptz, v_actor_id
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP WEATHERBOND MAX NP2027 TERAKOTA SR', 26, 1390000, 'PAIL', 0, 0
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP PLATONE 8000 NP 601 INTERNATIONAL', 10, 290000, 'GLN', 0, 0
      , ('2026-07-06'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/08072026-213' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'Pak Dhani / Masjid Al Hijrah' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/08072026-213', 'paid',
        2920000, 0, 2920000, 2920000,
        'IDR', '2026-07-08', '2026-07-08'::timestamptz, v_actor_id
      , ('2026-07-08'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'Nippon Spotles OW 1083 Reticent White tinting', 2, 1460000, 'PAIL', 0, 0
      , ('2026-07-08'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/11072026-214' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'Pak Putra' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/11072026-214', 'paid',
        1516250, 0, 1516250, 1516250,
        'IDR', '2026-07-11', '2026-07-11'::timestamptz, v_actor_id
      , ('2026-07-11'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP 5400 WALL SEALER WHITE (PROJ)', 1, 760000, 'PAIL', 0, 0
      , ('2026-07-11'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP VINILEX (PROJ) N 3049 P MAMMOTH GRAY', 1, 756250, 'PAIL', 0, 0
      , ('2026-07-11'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/14072026-215' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'CV MULIA / PAK SYAHRUL' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/14072026-215', 'paid',
        11540000, 0, 11540000, 11540000,
        'IDR', '2026-07-14', '2026-07-14'::timestamptz, v_actor_id
      , ('2026-07-14'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP VINILEX BRILLIANT WHITE 2002 PROJ', 15, 720000, 'PAIL', 0, 0
      , ('2026-07-14'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP VINILEX (950 PURE GREY) PROJ', 1, 740000, 'PAIL', 0, 0
      , ('2026-07-14'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/16072026-216' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'Pak Putra' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/16072026-216', 'paid',
        120000, 0, 120000, 120000,
        'IDR', '2026-07-16', '2026-07-16'::timestamptz, v_actor_id
      , ('2026-07-16'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP COLOURANT BLACK @1L', 1, 120000, 'CAN', 0, 0
      , ('2026-07-16'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/17062026-205 Rev1' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'CV AURUM ZURIATAMA ANDALAN' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/17062026-205 Rev1', 'paid',
        3075000, 0, 3075000, 3075000,
        'IDR', '2026-06-17', '2026-06-17'::timestamptz, v_actor_id
      , ('2026-06-17'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP 5400 SEALER WHITE (PROJ) @20L', 1, 700000, 'PAIL', 0, 0
      , ('2026-06-17'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP SPORTKOTE STANDARD COLOUR (PROJ) @25KG', 1, 935000, 'PAIL', 0, 0
      , ('2026-06-17'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 3,
        'NP MATEX CAT GENTENG PROJ (IMPRESSIONS NP AC 2114A) @15L', 2, 720000, 'PAIL', 0, 0
      , ('2026-06-17'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/19052026-201' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'PT DUTA RAMA - PT GALA KARYA, KSO' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/19052026-201', 'paid',
        407605000, 0, 407605000, 407605000,
        'IDR', '2026-05-19', '2026-05-19'::timestamptz, v_actor_id
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP 5400 WALL SEALER PROJ', 20, 625000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP 5200 WALL SEALER PROJ', 166, 500000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 3,
        'NP FLAWLESS EASY WASH N3213P WHITECHOC', 265, 905000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 4,
        'NP WEATHERBOND MAX N3213P WHITECHOC', 36, 1390000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 5,
        'NP WEATHERBOND MAX N2047P STEEL POT PROJ', 4, 1390000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 6,
        'NP WEATHERBOND MAX NP BRILLIANT WHITE', 6, 1390000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 7,
        'NP WEATHERBOND MAX NP2027 TERAKOTA SR', 6, 1390000, 'PAIL', 0, 0
      , ('2026-05-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/19062026-206' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'CV SOKI TAMELIN' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/19062026-206', 'paid',
        3600000, 0, 3600000, 3600000,
        'IDR', '2026-06-19', '2026-06-19'::timestamptz, v_actor_id
      , ('2026-06-19'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP VINILEX BRILLIANT WHITE 2002 PROJECT', 5, 720000, 'PAIL', 0, 0
      , ('2026-06-19'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/20072026-217' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'PT DUTA RAMA - PT GALA KARYA, KSO' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/20072026-217', 'paid',
        152900000, 0, 152900000, 152900000,
        'IDR', '2026-07-20', '2026-07-20'::timestamptz, v_actor_id
      , ('2026-07-20'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP WEATHERBOND MAX NP2027 TERAKOTA SR', 60, 1390000, 'PAIL', 0, 0
      , ('2026-07-20'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP WEATHERBOND MAX- NP N 3035 P CLOUDS', 30, 1390000, 'PAIL', 0, 0
      , ('2026-07-20'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 3,
        'NP WEATHERBOND MAX NP BRILLIANT WHITE', 20, 1390000, 'PAIL', 0, 0
      , ('2026-07-20'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/21072026-218' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'PAK EFRI PTPN' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/21072026-218', 'paid',
        2160000, 0, 2160000, 2160000,
        'IDR', '2026-07-21', '2026-07-21'::timestamptz, v_actor_id
      , ('2026-07-21'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP VINILEX BRILLIANT WHITE 2002 PROJECT', 3, 720000, 'PAIL', 0, 0
      , ('2026-07-21'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/24062026-207' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'BOTANICA SPRINGHILL RESIDENCE' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/24062026-207', 'paid',
        520000, 0, 520000, 520000,
        'IDR', '2026-06-24', '2026-06-24'::timestamptz, v_actor_id
      , ('2026-06-24'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP VINILEX PRO 1000 BRILLIANT WHITE PROJECT', 1, 520000, 'PAIL', 0, 0
      , ('2026-06-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/24072026-219' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'Pak Putra' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/24072026-219', 'paid',
        4112680, 0, 4112680, 4112680,
        'IDR', '2026-07-24', '2026-07-24'::timestamptz, v_actor_id
      , ('2026-07-24'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP 5400 WALL SEALER WHITE (PROJ)', 2, 760000, 'PAIL', 0, 0
      , ('2026-07-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP VINILEX (PROJ) N 3049 P MAMMOTH GRAY', 2, 756250, 'PAIL', 0, 0
      , ('2026-07-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 3,
        'NP 5200 WALL SEALER WHITE (PROJ)', 2, 540090, 'PAIL', 0, 0
      , ('2026-07-24'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/29052026-202' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'CV SOKI TAMELIN' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/29052026-202', 'paid',
        2880000, 0, 2880000, 2880000,
        'IDR', '2026-05-29', '2026-05-29'::timestamptz, v_actor_id
      , ('2026-05-29'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP VINILEX BRILLIANT WHITE', 4, 720000, 'PAIL', 0, 0
      , ('2026-05-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/29072026-220' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'Pak Putra' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/29072026-220', 'paid',
        7681520, 0, 7681520, 7681520,
        'IDR', '2026-07-29', '2026-07-29'::timestamptz, v_actor_id
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP 5400 WALL SEALER WHITE (PROJ)', 3, 760000, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP VINILEX (PROJ) N 3049 P MAMMOTH GRAY', 3, 756250, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 3,
        'NP 5200 WALL SEALER WHITE (PROJ)', 3, 540090, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 4,
        'NP VINILEX (PROJ) OW 1088 P GENTEEL', 2, 756250, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/29072026-221' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'PT DUTA RAMA - PT GALA KARYA, KSO' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/29072026-221', 'paid',
        110830000, 0, 110830000, 110830000,
        'IDR', '2026-07-29', '2026-07-29'::timestamptz, v_actor_id
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP 5400 Wall Sealer PROJ', 50, 625000, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP WEATHERBOND MAX N3213P WHITECHOC BREAD PROJ', 50, 1390000, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 3,
        'NP WEATHERBOND MAX NP2027 TERAKOTA SR PROJ', 6, 1390000, 'PAIL', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 4,
        'NP PLATONE 8000 NP 601 INTERNATIONAL ORANGE PROJ', 6, 290000, 'GLN', 0, 0
      , ('2026-07-29'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/30052026-203' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'PT Karen Nauli' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/30052026-203', 'paid',
        14433000, 0, 14433000, 14433000,
        'IDR', '2026-05-30', '2026-05-30'::timestamptz, v_actor_id
      , ('2026-05-30'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP WEATHERBOND MAX APPLE WHITE NP OW', 5, 1743000, 'PAIL', 0, 0
      , ('2026-05-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP VINILEX APPLE WHITE NP OW', 3, 744000, 'PAIL', 0, 0
      , ('2026-05-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 3,
        'NP WEATHERBOND MAX S1515-G20Y', 2, 1743000, 'PAIL', 0, 0
      , ('2026-05-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/30062026-206' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'BPK. SIGIT SR' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/30062026-206', 'paid',
        15620000, 0, 15620000, 15620000,
        'IDR', '2026-06-30', '2026-06-30'::timestamptz, v_actor_id
      , ('2026-06-30'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP 9200F EPOXY PRIMER', 42, 210000, 'L', 0, 0
      , ('2026-06-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 2,
        'NP PU HS', 40, 170000, 'L', 0, 0
      , ('2026-06-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

  DECLARE v_invoice_id UUID; v_client_id UUID; BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/30062026-207' AND deleted_at IS NULL
    ) THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE workspace_id = v_workspace_id AND name = 'PT DUTA RAMA - PT GALA KARYA, KSO' AND deleted_at IS NULL;

      INSERT INTO public.invoices (
        workspace_id, client_id, invoice_number, status,
        subtotal, tax_amount, total, amount_paid, currency, issue_date, paid_at, created_by
      , created_at) VALUES (
        v_workspace_id, v_client_id, 'PI AWP-P/30062026-207', 'paid',
        69500000, 0, 69500000, 69500000,
        'IDR', '2026-06-30', '2026-06-30'::timestamptz, v_actor_id
      , ('2026-06-30'::timestamp AT TIME ZONE 'Asia/Jakarta'))
      RETURNING id INTO v_invoice_id;

      INSERT INTO public.line_items (
        workspace_id, entity_type, entity_id, category, sort_order,
        description, quantity, unit_price, unit, discount_percent, tax_percent
      , created_at) VALUES (
        v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 1,
        'NP WEATHERBOND MAX NP BRILLIANT WHITE', 50, 1390000, 'PAIL', 0, 0
      , ('2026-06-30'::timestamp AT TIME ZONE 'Asia/Jakarta'));
    END IF;
  END;

END $$;

NOTIFY pgrst, 'reload schema';
