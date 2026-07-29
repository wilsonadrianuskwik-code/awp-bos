-- Historical invoices from 00095 were stamped status = 'paid' with
-- amount_paid = total, but no row was written to `payments` -- so the
-- Documents table's "Paid On" column (which reads only payments.payment_date,
-- never invoices.paid_at) showed a blank date next to a "Paid" badge.
-- This adds the missing payment record for each one, dated to the
-- invoice's own issue date (the best available signal -- the source
-- data carries no separate payment date).
--
-- payment_number is a "HIST-" prefixed value derived from the invoice's
-- own number, not run through next_document_number()/the numbering
-- engine -- same reasoning as 00095: this must never touch the live
-- counter for new documents.
--
-- payment_method is set to 'bank_transfer' -- the overwhelmingly likely
-- method for B2B trade payments in this business, but genuinely an
-- assumption, not something recoverable from the source data. Correct
-- it per-payment in the Payments module if any of these were actually
-- cash/check.

DO $$
DECLARE
  v_workspace_id UUID;
  v_actor_id     UUID;
BEGIN
  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = 'awp-k68w';
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace awp-k68w not found -- aborting historical payment backfill';
  END IF;

  SELECT id INTO v_actor_id FROM auth.users WHERE email = 'wilsonadrianuskwik@gmail.com';
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'User wilsonadrianuskwik@gmail.com not found -- aborting historical payment backfill';
  END IF;


  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/02062026-204' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/02062026-204', 404325000, 'IDR',
        'bank_transfer', '2026-06-02',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/02072026-208' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/02072026-208', 789000, 'IDR',
        'bank_transfer', '2026-07-02',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/03072026-209' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/03072026-209', 13805000, 'IDR',
        'bank_transfer', '2026-07-03',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/06072026-210' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/06072026-210', 980000, 'IDR',
        'bank_transfer', '2026-07-06',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/06072026-211' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/06072026-211', 2120000, 'IDR',
        'bank_transfer', '2026-07-06',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/06072026-212' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/06072026-212', 39040000, 'IDR',
        'bank_transfer', '2026-07-06',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/08072026-213' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/08072026-213', 2920000, 'IDR',
        'bank_transfer', '2026-07-08',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/11072026-214' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/11072026-214', 1516250, 'IDR',
        'bank_transfer', '2026-07-11',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/14072026-215' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/14072026-215', 11540000, 'IDR',
        'bank_transfer', '2026-07-14',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/16072026-216' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/16072026-216', 120000, 'IDR',
        'bank_transfer', '2026-07-16',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/17062026-205 Rev1' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/17062026-205-Rev1', 3075000, 'IDR',
        'bank_transfer', '2026-06-17',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/19052026-201' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/19052026-201', 407605000, 'IDR',
        'bank_transfer', '2026-05-19',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/19062026-206' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/19062026-206', 3600000, 'IDR',
        'bank_transfer', '2026-06-19',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/20072026-217' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/20072026-217', 152900000, 'IDR',
        'bank_transfer', '2026-07-20',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/21072026-218' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/21072026-218', 2160000, 'IDR',
        'bank_transfer', '2026-07-21',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/24062026-207' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/24062026-207', 520000, 'IDR',
        'bank_transfer', '2026-06-24',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/24072026-219' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/24072026-219', 4112680, 'IDR',
        'bank_transfer', '2026-07-24',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/29052026-202' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/29052026-202', 2880000, 'IDR',
        'bank_transfer', '2026-05-29',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/29072026-220' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/29072026-220', 7681520, 'IDR',
        'bank_transfer', '2026-07-29',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/29072026-221' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/29072026-221', 110830000, 'IDR',
        'bank_transfer', '2026-07-29',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/30052026-203' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/30052026-203', 14433000, 'IDR',
        'bank_transfer', '2026-05-30',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/30062026-206' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/30062026-206', 15620000, 'IDR',
        'bank_transfer', '2026-06-30',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

  DECLARE v_invoice_id UUID; BEGIN
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE workspace_id = v_workspace_id AND invoice_number = 'PI AWP-P/30062026-207' AND deleted_at IS NULL;

    IF v_invoice_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = v_invoice_id AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.payments (
        workspace_id, invoice_id, payment_number, amount, currency,
        payment_method, payment_date, notes, recorded_by
      ) VALUES (
        v_workspace_id, v_invoice_id, 'HIST-PI-AWP-P/30062026-207', 69500000, 'IDR',
        'bank_transfer', '2026-06-30',
        'Backfilled from historical import (00095) -- payment date assumed = issue date.',
        v_actor_id
      );
    END IF;
  END;

END $$;

NOTIFY pgrst, 'reload schema';
