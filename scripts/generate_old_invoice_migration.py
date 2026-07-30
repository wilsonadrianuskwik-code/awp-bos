#!/usr/bin/env python3
"""
Generates supabase/migrations/00100_import_old_invoice_register.sql from the
"Raw_2.xlsx" invoice register.

Committed alongside the migration so the import is auditable and
reproducible: the SQL is long and mechanical, and the only way to check it
faithfully represents the spreadsheet is to be able to re-run the thing that
produced it.

Usage:  python3 scripts/generate_old_invoice_migration.py <path-to-xlsx>
"""
import sys
import re
import datetime
from collections import Counter
from decimal import Decimal as D, ROUND_HALF_UP
from fractions import Fraction

CENT = D("0.01")


def r2(x):
    """Round to 2dp the way Postgres ROUND(numeric, 2) does."""
    return D(x).quantize(CENT, rounding=ROUND_HALF_UP)


def tax_amounts(base, frac, ppn_pct, pph_pct, ret_pct):
    """
    The exact steps recompute_invoice_totals() takes (00082), in decimal, so
    what is written here is byte-for-byte what the database would compute.
    """
    dpp = r2(base * D(frac.numerator) / D(frac.denominator))
    ppn = r2(dpp * D(str(ppn_pct)) / 100)
    pph = r2(base * D(str(pph_pct or 0)) / 100)
    ret = r2(base * D(str(ret_pct or 0)) / 100)
    return {"dpp": dpp, "ppn": ppn, "pph": pph, "ret": ret,
            "total": base + ppn - pph - ret}

WORKSPACE_SLUG = "awp-k68w"
ACTOR_EMAIL = "wilsonadrianuskwik@gmail.com"
PROJECT_CODE = "OLD-INV"
PROJECT_NAME = "Old Invoice"
SHEET = "hoho"

COLS = [
    "Tanggal", "Month and Year", "NO PO Customer", "NO INV", "NO.SERI FPN",
    "Customer Name", "KET", "HARGA JUAL TANPA PPN", "PTG DP", "DPP 11/12",
    "PPN 12%", "PPH23 2%", "retensi 5%", "BIAYA ADM", "TOTAL",
    "Tanggal PAYMENT", "Total Payment TERIMA", "PLUS/MINUS",
]


def num(v):
    """Numeric value of a cell. Columns L/M arrive as text ('Rp 1,817,400')."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[^0-9.\-]", "", str(v))
    if s in ("", "-", "."):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def q(s):
    """SQL string literal."""
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def load(path):
    import openpyxl
    ws = openpyxl.load_workbook(path, data_only=True)[SHEET]
    rows = []
    for r in range(2, ws.max_row + 1):
        d = {COLS[c - 1]: ws.cell(r, c).value for c in range(1, len(COLS) + 1)}
        if any(v is not None for v in d.values()):
            d["_row"] = r
            rows.append(d)
    return rows


def is_invoice(r):
    """
    An invoice row carries an identity (number or customer) or a taxable
    base. Rows with only a payment amount -- and the few carrying only a
    revised PPH and a restated net (row 60) -- are continuation rows
    belonging to the invoice above, not invoices of their own.
    """
    return bool(
        r.get("NO INV") or r.get("Customer Name")
        or num(r.get("DPP 11/12")) is not None
        or num(r.get("HARGA JUAL TANPA PPN")) is not None
    )


def as_date(v):
    """Column P holds text notes ('WT-D8') on a few rows, not only dates."""
    if isinstance(v, datetime.datetime):
        return v.date()
    if isinstance(v, datetime.date):
        return v
    return None


def swap_day_month(d):
    try:
        return d.replace(month=d.day, day=d.month)
    except ValueError:
        return None


def group(rows):
    """Attach continuation rows to the invoice they follow."""
    groups = []
    for r in rows:
        if is_invoice(r):
            groups.append({"inv": r, "cont": []})
        elif groups:
            groups[-1]["cont"].append(r)
    return groups


def solve_tax(r, notes):
    """
    Recover harga_jual and the four rates for one row.

    The sheet's arithmetic is the app's own:
        DPP   = harga_jual * dpp_num/dpp_den
        PPN   = DPP * ppn_pct
        PPH   = harga_jual * pph_pct
        RET   = harga_jual * ret_pct
        TOTAL = harga_jual + PPN - PPH - RET
    """
    h = num(r.get("HARGA JUAL TANPA PPN"))
    j = num(r.get("DPP 11/12"))
    k = num(r.get("PPN 12%"))
    l = num(r.get("PPH23 2%"))
    m = num(r.get("retensi 5%"))
    o = num(r.get("TOTAL"))
    if o is None:
        return None

    # Which of the two stated bases reproduces this row's own TOTAL. Rows
    # carrying a DP deduction state both a pre-DP figure (H) and the
    # post-DP taxable base (J); which one the total was struck on varies.
    base = None
    for cand in ([h] if h else []) + ([j] if j else []):
        if abs(cand + (k or 0) - (l or 0) - (m or 0) - o) <= 2:
            base = cand
            break

    if base is None:
        # Components contradict the row's own TOTAL (source typos). Per the
        # decision to trust TOTAL, hold the stated withholdings and the PPN
        # rate and back-solve the base that reproduces TOTAL exactly:
        #   base * (1 + f*ppn) = TOTAL + PPH + RET
        f = 1.0
        ppn_pct = 0.0
        if j and k:
            ppn_pct = round(k / j * 100, 3)
            if h and abs(j / h - 11 / 12) < 0.0005:
                f = 11 / 12
        base = (o + (l or 0) + (m or 0)) / (1 + f * ppn_pct / 100)
        notes.append("components contradicted TOTAL; base back-solved from TOTAL")
    else:
        f = (j / base) if j else 1.0
        ppn_pct = round(k / j * 100, 3) if (j and k) else 0.0

    # The fraction is always one of the two the law used.
    if abs(f - 11 / 12) < 0.0005:
        dpp_num, dpp_den = 11, 12
    elif abs(f - 1.0) < 0.0005:
        dpp_num, dpp_den = 1, 1
    else:
        dpp_num, dpp_den = 1, 1
        notes.append("DPP/base ratio %.5f is neither 1/1 nor 11/12; stored as 1/1" % f)

    # PPH and retensi: rate against the base the total was struck on. On the
    # DP rows the sheet computed these on the pre-DP figure instead, which a
    # single-base model cannot express, so the effective rate is stored --
    # exact to 3dp, which is the column's precision.
    pph_pct = round(l / base * 100, 3) if l else None
    ret_pct = round(m / base * 100, 3) if m else None

    # The rate columns hold 3 decimals, so an effective rate recovered from
    # an amount does not always reproduce that amount exactly. Left alone
    # the invoice would be internally inconsistent: the stored total would
    # say one thing while the detail page, which recomputes the breakdown
    # from these rates, would render another. TOTAL is the figure to
    # protect, so the base is nudged to whatever reproduces it under the
    # stored rates. On the rows whose components are self-consistent --
    # most of them -- this is a no-op and the base stays exactly as stated.
    denom = 1 + (dpp_num / dpp_den) * ppn_pct / 100 \
              - (pph_pct or 0) / 100 - (ret_pct or 0) / 100
    if denom > 0:
        exact = o / denom
        if abs(exact - base) > 1:
            notes.append(
                "base adjusted %.2f -> %.2f so the stored rates reproduce TOTAL "
                "(source computed PPH/retensi on a different base)"
                % (base, exact))
            base = exact

    # Settle the base in decimal, not binary floating point, and search the
    # nearest cents for one that reproduces TOTAL exactly under Postgres'
    # own arithmetic. Without this, 79 invoices drifted by up to Rp 1 the
    # moment recompute_invoice_totals() ran -- harmless in itself, but it
    # would mean any later edit silently nudged a historical total, and
    # "the figures never move unless you move them" is worth an exact match.
    target = D(str(o)).quantize(CENT)
    frac = Fraction(dpp_num, dpp_den)
    best, best_gap = None, None
    for step in range(0, 401):
        for sign in ((1,) if step == 0 else (1, -1)):
            cand = (D(repr(base)) + sign * step * CENT).quantize(CENT)
            if cand <= 0:
                continue
            amts = tax_amounts(cand, frac, ppn_pct, pph_pct, ret_pct)
            gap = abs(amts["total"] - target)
            if best_gap is None or gap < best_gap:
                best, best_gap = cand, gap
            if gap == 0:
                break
        if best_gap == 0:
            break
    base = best
    amts = tax_amounts(base, frac, ppn_pct, pph_pct, ret_pct)
    if best_gap != 0:
        notes.append("stored rates reproduce TOTAL to within Rp %s" % best_gap)

    return dict(
        harga_jual=base, dpp_num=dpp_num, dpp_den=dpp_den,
        ppn_pct=ppn_pct, pph_pct=pph_pct, ret_pct=ret_pct,
        # Stored amounts are recomputed from the final base so the row is
        # self-consistent; the register's own figures are preserved
        # verbatim in custom_fields.source.stated.
        dpp_amt=amts["dpp"], ppn_amt=amts["ppn"],
        pph_amt=amts["pph"], ret_amt=amts["ret"],
        total=target,
        stated=dict(harga_jual=h, dpp=j, ppn=k, pph=l, retensi=m, total=o),
    )


def find_lump_rows(groups):
    """
    Rows whose payment figure is one bank credit settling several invoices
    at once, not a payment for that invoice alone.

    The register records these on the LAST invoice of a run of consecutive
    rows sharing a customer and a payment date, with the earlier rows in the
    run left blank. Taking the figure at face value while also treating each
    blank row as settled would count the same money twice -- once as the
    lump and once per invoice -- which is where a ~Rp 1bn overstatement came
    from before this was spotted. Detected by the arithmetic that defines
    them: exactly one figure in the run, equal to the run's combined totals
    (bar a small stated admin fee).

    Returns the set of source row numbers carrying such a lump.
    """
    lumps = set()
    runs, cur = [], []

    def key(r):
        return (r.get("Customer Name"), as_date(r.get("Tanggal PAYMENT")))

    for gr in groups:
        r = gr["inv"]
        if cur and key(r) == key(cur[-1]) and key(r)[1] is not None:
            cur.append(r)
        else:
            if len(cur) > 1:
                runs.append(cur)
            cur = [r]
    if len(cur) > 1:
        runs.append(cur)

    for run in runs:
        with_q = [(r["_row"], num(r.get("Total Payment TERIMA"))) for r in run
                  if num(r.get("Total Payment TERIMA"))]
        run_total = sum(num(r.get("TOTAL")) or 0 for r in run)
        if len(with_q) == 1 and abs(with_q[0][1] - run_total) <= len(run) * 3000:
            lumps.add(with_q[0][0])
    return lumps


def build(rows):
    groups = group(rows)
    clients = sorted({g["inv"]["Customer Name"] for g in groups
                      if g["inv"].get("Customer Name")})
    lump_rows = find_lump_rows(groups)

    # Placeholder numbers for rows the register never numbered, sequential
    # per year in date order so they are stable and obviously synthetic.
    per_year = Counter()
    used_numbers = set()
    invoices = []
    stats = Counter()

    for g in groups:
        r = g["inv"]
        notes = []
        issue = as_date(r.get("Tanggal"))
        tax = solve_tax(r, notes)

        number = str(r["NO INV"]).strip() if r.get("NO INV") else None
        if not number:
            yr = issue.year if issue else 0
            per_year[yr] += 1
            number = "OLD/%d/%03d" % (yr, per_year[yr])
            notes.append("invoice number not in source; placeholder assigned")

        fpn = str(r["NO.SERI FPN"]).strip().lstrip('"') if r.get("NO.SERI FPN") else None

        # invoice_number is UNIQUE per workspace. A collision must be resolved
        # rather than left to the idempotency guard, which would skip the
        # second invoice and lose it silently.
        if number in used_numbers:
            stated = number
            resolved = None
            # The register's own convention, holding on 200 rows, is that the
            # number's leading digits are the last 4 of the tax serial. The
            # serial is government-issued, so where it disagrees it is the
            # better authority -- row 66 is numbered 6577 but carries serial
            # ...33486578, one past row 65's ...6577, and 6578 is unused.
            mfpn = re.search(r"(\d{4})$", fpn or "")
            mnum = re.match(r"^(\d{4})/(.*)$", number)
            if mfpn and mnum and mfpn.group(1) != mnum.group(1):
                cand = "%s/%s" % (mfpn.group(1), mnum.group(2))
                if cand not in used_numbers:
                    resolved = cand
            if resolved is None:
                n = 2
                while "%s (%d)" % (number, n) in used_numbers:
                    n += 1
                resolved = "%s (%d)" % (number, n)
            number = resolved
            notes.append(
                "register states invoice number %s, already used by an earlier "
                "row; stored as %s" % (stated, number))
            stats["duplicate invoice numbers resolved"] += 1
        used_numbers.add(number)
        cancelled = bool(fpn and "BATAL" in fpn.upper())

        # ---- payments -------------------------------------------------
        pays = []
        annotated = []
        pdate = as_date(r.get("Tanggal PAYMENT"))
        pamt = num(r.get("Total Payment TERIMA"))
        if r["_row"] in lump_rows and tax:
            # One bank credit covering this invoice and the blank-amount ones
            # above it. Each invoice in the run is credited its own total, so
            # the run sums to the credit instead of double counting it.
            stats["lump credits split across their run"] += 1
            notes.append(
                "source figure Rp %s was one credit settling several invoices; "
                "this invoice credited its own TOTAL" % "{:,.0f}".format(pamt))
            pamt = tax["total"]
        elif tax and pdate and pamt is None:
            # A date was recorded but the amount column was not kept in
            # those years; treated as settled in full (see migration head).
            pamt = tax["total"]
            notes.append("payment amount absent in source; taken as TOTAL")
        if pamt:
            pays.append({"date": pdate, "amount": r2(D(str(pamt)))})

        # Continuation rows: further installments. A row whose amount equals
        # the running total and carries no date is the register's own
        # subtotal line, not another payment.
        # Running total for spotting the register's own subtotal lines. It
        # counts the annotated amounts too: those rows are not imported as
        # payments, but the register still added them in when it struck its
        # subtotal, so leaving them out here makes a subtotal line look like
        # a fresh payment.
        running = float(pays[0]["amount"]) if pays else 0.0
        for c in g["cont"]:
            a = num(c.get("Total Payment TERIMA"))
            if not a:
                continue
            raw_date = c.get("Tanggal PAYMENT")
            cd = as_date(raw_date)
            if abs(a - running) < 2 and running > 0:
                # Restates the running total rather than adding to it.
                stats["checksum rows skipped"] += 1
                continue
            if cd is None and raw_date is not None:
                # Text where a date belongs ("WT-D8", "PROGRESS 2") -- a
                # withholding-tax credit or a payment the register itself
                # attributes to a different invoice. Which invoice it settles
                # is not recoverable, so no payment is created; the note and
                # amount are kept on the invoice instead.
                annotated.append({"note": str(raw_date).strip(), "amount": a})
                stats["annotated rows kept as notes, not payments"] += 1
                running += a
                continue
            pays.append({"date": cd, "amount": r2(D(str(a)))})
            running += a

        # Payment dates that fall before their own invoice are impossible as
        # written; every one becomes valid with day and month exchanged, so
        # the pair was transposed on entry. Only these are touched -- dates
        # that already make sense are left alone even where a swap would
        # also parse.
        for pay in pays:
            if pay["date"] and issue and pay["date"] < issue:
                s = swap_day_month(pay["date"])
                if s and s >= issue:
                    pay["date"] = s
                    stats["payment dates un-transposed"] += 1
                else:
                    # Not explainable as a transposition. Left as the register
                    # has it rather than quietly moved: on both such rows the
                    # invoice's own date looks like the mistyped one (row 115
                    # is numbered 8921/AWP/2022 and sits among Dec-2022 rows
                    # while dated 2023-12-28), so moving the payment would
                    # paper over the wrong field.
                    notes.append("payment date precedes invoice date in source; "
                                 "both left as recorded, needs a human eye")
                    stats["payment date before invoice, left as-is"] += 1
        for pay in pays:
            if pay["date"] is None:
                pay["date"] = issue

        # Cap the credited cash at what the invoice was actually issued for.
        #
        # "Total Payment TERIMA" is not reliably one invoice's payment: on an
        # irregular set of rows it holds a single bank credit settling several
        # invoices at once, written against whichever row the bookkeeper
        # reached (row 114 carries Rp 506,784,930 against a Rp 1,304,250
        # invoice). Where the run is arithmetically identifiable it is split
        # properly above; the rest cannot be bounded from the sheet, and
        # taking them at face value left 22 invoices "overpaid" by a combined
        # Rp 2.5bn, which is not a thing that happened.
        #
        # So a payment is trimmed to the balance outstanding and the figure
        # the register actually stated is preserved in custom_fields. This
        # can only ever under-credit an invoice, never over-credit one, and
        # the excess is recorded rather than discarded.
        if tax:
            kept, remaining = [], tax["total"]
            for pay in pays:
                if remaining <= 0.01:
                    annotated.append({
                        "note": "unallocated credit stated in register",
                        "amount": float(pay["amount"]), "date": str(pay["date"]),
                    })
                    stats["payments beyond invoice total, recorded as notes"] += 1
                    continue
                if pay["amount"] > remaining:
                    # Only worth a note when the gap is real money; four rows
                    # overstate by a rupiah or less, which is the customer
                    # rounding up, not a misallocated credit.
                    if pay["amount"] - remaining > 2:
                        annotated.append({
                            "note": "register stated Rp %s here; trimmed to the "
                                    "balance outstanding" % "{:,.0f}".format(pay["amount"]),
                            "amount": float(pay["amount"]), "date": str(pay["date"]),
                        })
                        stats["payments trimmed to invoice balance"] += 1
                    else:
                        stats["payments rounded down by <=Rp 2"] += 1
                    pay = dict(pay, amount=r2(remaining))
                kept.append(pay)
                remaining -= pay["amount"]
            pays = kept

        paid = r2(sum((p["amount"] for p in pays), D(0)))
        if cancelled:
            status = "cancelled"
        elif tax is None:
            status = "cancelled"
        elif paid <= 0:
            status = "sent"
        elif paid + 2 >= tax["total"]:
            status = "paid"
        else:
            status = "partial"
        stats["status=" + status] += 1
        if tax and paid > tax["total"] + 2:
            stats["overpaid (imported as recorded)"] += 1

        invoices.append(dict(
            row=r["_row"], number=number, client=r.get("Customer Name"),
            issue=issue, ket=str(r["KET"]).strip() if r.get("KET") else None,
            tax=tax, pays=pays, paid=paid, status=status, fpn=fpn,
            annotated=annotated,
            po=str(r["NO PO Customer"]).strip() if r.get("NO PO Customer") else None,
            adm=str(r["BIAYA ADM"]).strip() if r.get("BIAYA ADM") else None,
            pm=str(r["PLUS/MINUS"]).strip() if r.get("PLUS/MINUS") else None,
            notes=notes,
        ))
    return clients, invoices, stats


def emit(clients, invoices, stats, out):
    L = out.append
    L("""-- Imports the historical invoice register ("Raw_2.xlsx", sheet 'hoho')
-- as %d invoices under a new project, "Old Invoice".
--
-- Generated by scripts/generate_old_invoice_migration.py -- do not
-- hand-edit; change the generator and re-run so the two stay in step.
--
-- WHY THE NUMBERS MAP CLEANLY
-- The register's arithmetic is already this app's Indonesian tax model:
--     DPP   = harga jual * dpp_num/dpp_den
--     PPN   = DPP * ppn_percent
--     PPH   = harga jual * pph_percent
--     RET   = harga jual * retensi_percent
--     TOTAL = harga jual + PPN - PPH - RET
-- which is recalc_invoice_totals() (00082) exactly. 373 of 409 source rows
-- reproduce their own stated TOTAL under it to the rupiah.
--
-- The rates are stored per invoice, not globally, because the register
-- spans three statutory regimes: PPN 10%% (2021-early 2022) on a full base,
-- 11%% (2022-2024) on a full base, and 12%% on an 11/12 DPP (2025 onward).
-- Storing today's 12%% against a 2021 invoice would restate history.
--
-- DECISIONS TAKEN (confirmed with the owner before writing this)
--   * 146 invoices carry a payment date but no amount -- the "Total
--     Payment TERIMA" column was not kept before March 2022. These are
--     recorded as settled in full on the stated date. This asserts an
--     amount the sheet does not state; it is the reading the owner
--     confirmed, and the alternative was leaving Rp 9.69bn of long-settled
--     2021-2025 invoices sitting in AR as outstanding.
--   * 34 rows were never numbered. They get OLD/<year>/<nnn>, sequential
--     by date, deliberately unlike a real AWP number.
--   * 20 of the 26 customers appear in the register only as short codes
--     (MJA, UUR, IIS, ...). Created under those codes verbatim rather than
--     guessing at legal names; rename in the app when convenient. RAPI is
--     left as its own client, NOT merged into PT Riau Andalan Pulp &
--     Paper, since that identification was not confirmed.
--   * 8 rows' components contradict their own TOTAL (source typos, e.g.
--     a DPP of 4,200,000 where 42,000,000 is what the total implies).
--     TOTAL is trusted -- it is the money actually invoiced and collected
--     -- and the taxable base is back-solved from it. The original cell
--     values are preserved in custom_fields.source so nothing is lost.
--
--   * "Total Payment TERIMA" is not reliably one invoice's payment: on an
--     irregular set of rows it holds a single bank credit settling several
--     invoices, written against whichever row the bookkeeper reached (row
--     114 carries Rp 506,784,930 against a Rp 1,304,250 invoice). Where a
--     run is arithmetically identifiable -- 9 runs, 31 invoices -- the
--     credit is split so each invoice takes its own total. Where it is not,
--     the payment is trimmed to the balance outstanding. Confirmed with the
--     owner: credit each invoice its own total and note any bank fee.
--
-- JUDGEMENTS MADE WITHOUT ASKING, EACH RECOVERABLE
--   * 33 payment dates fall before their own invoice, which cannot be.
--     Every one of the 33 becomes valid with day and month exchanged, so
--     the pair was transposed on entry; they are un-transposed here. Dates
--     that already make sense are left untouched even where a swap would
--     also parse -- 109 of those are genuinely ambiguous and guessing at
--     them would corrupt data that currently reads correctly. 2 dates are
--     not explainable as a transposition and are left exactly as recorded,
--     flagged in custom_fields, because on both the invoice's own date is
--     the one that looks mistyped (row 115 is numbered 8921/AWP/2022 and
--     sits among Dec-2022 rows while dated 2023-12-28).
--   * No invoice is ever credited more than it was issued for. 11 payments
--     were trimmed to the balance outstanding and 8 dropped entirely as
--     already-settled; every stated figure is preserved in
--     custom_fields.source.unattributed_rows. Taken at face value these
--     left 22 invoices "overpaid" by a combined Rp 2.5bn, which is not a
--     thing that happened. This can only under-credit, never over-credit.
--   * 8 continuation rows restate the running payment total rather than
--     adding to it (the register's own subtotal lines). Skipped, not
--     imported as phantom payments.
--   * Row 66 repeats row 65's invoice number, 6577/AWP/2022, but is plainly
--     a different invoice (different customer, different work) and carries
--     tax serial ...33486578 -- one past row 65's ...6577. Since the number
--     is UNIQUE per workspace, leaving it would have silently dropped the
--     invoice. Stored as 6578/AWP/2022, which is unused and matches the
--     register's own number-to-serial convention (holds on 200 rows); the
--     stated number is kept in custom_fields.
--   * On rows carrying a DP deduction the register computed PPH/retensi on
--     the pre-DP figure while striking PPN on the post-DP base. One base
--     per invoice cannot express both, so the effective rate against the
--     base is stored (3dp, the column's precision) and the base is settled
--     in decimal -- mirroring Postgres' own ROUND(numeric, 2) -- against
--     whichever cent reproduces TOTAL. A displayed PPH can therefore differ
--     from the register by a few rupiah; the register's own figures are kept
--     in custom_fields.source.stated.
--
--     Checked by running the real recompute_invoice_totals() over all 386
--     rows on a scratch Postgres 16: every dpp/ppn/pph/retensi amount comes
--     back bit-identical, 377 totals are unchanged, and 9 move by exactly
--     Rp 0.01 -- unreachable at 3dp rate precision, and rupiah has no
--     subunit, so that is as exact as this schema can be. The workspace
--     total is unaffected: Rp 36,119,161,625 before and after.
--   * payment_method is 'bank_transfer' throughout -- the likely method
--     for this trade but not recoverable from the source, same assumption
--     and caveat as 00096.
--   * Each invoice becomes one line item (qty 1) described by the
--     register's KET text. The register holds no per-item breakdown, so
--     inventing line detail would be fabrication.
--   * due_date is left NULL: the register records no payment terms.
--
-- WHAT THIS DOES NOT CLAIM
--   Rp 34,177,504,171 is recorded against Rp 36,119,161,625 invoiced. The
--   Rp 1.94bn gap is 27 invoices the register itself shows as short-paid
--   (Rp 714m, including six at exactly Rp 2,000 -- a bank fee the customer
--   deducted), 3 with no payment recorded at all, and the trimmed credits
--   above. None of it is a guess: where the register is silent or
--   self-contradictory this import under-credits and says so, rather than
--   inventing cash receipts.
--
-- Totals are written directly and recalc_invoice_totals() is deliberately
-- NOT called, so what is stored is what the register says. Editing one of
-- these invoices in the app will recalculate it from the stored rates.
--
-- Idempotent: re-running inserts nothing already present.
""" % len(invoices))

    L("DO $$")
    L("DECLARE")
    L("  v_workspace_id UUID;")
    L("  v_actor_id     UUID;")
    L("  v_project_id   UUID;")
    L("  v_client_id    UUID;")
    L("  v_invoice_id   UUID;")
    L("BEGIN")
    L("  SELECT id INTO v_workspace_id FROM public.workspaces WHERE slug = %s;" % q(WORKSPACE_SLUG))
    L("  IF v_workspace_id IS NULL THEN")
    L("    RAISE EXCEPTION 'Workspace %s not found -- aborting Old Invoice import';" % WORKSPACE_SLUG)
    L("  END IF;")
    L("")
    L("  SELECT id INTO v_actor_id FROM auth.users WHERE email = %s;" % q(ACTOR_EMAIL))
    L("  IF v_actor_id IS NULL THEN")
    L("    RAISE EXCEPTION 'User %s not found -- aborting Old Invoice import';" % ACTOR_EMAIL)
    L("  END IF;")
    L("")
    L("  -- ---------------------------------------------------------------")
    L("  -- Project")
    L("  -- ---------------------------------------------------------------")
    L("  SELECT id INTO v_project_id FROM public.projects")
    L("    WHERE workspace_id = v_workspace_id AND code = %s AND deleted_at IS NULL;" % q(PROJECT_CODE))
    L("  IF v_project_id IS NULL THEN")
    L("    INSERT INTO public.projects (workspace_id, code, name, status, currency, notes, created_by)")
    L("    VALUES (v_workspace_id, %s, %s, 'completed', 'IDR'," % (q(PROJECT_CODE), q(PROJECT_NAME)))
    L("            %s," % q("Historical invoice register imported from Raw_2.xlsx. Spans %d invoices, "
                            "2021-2026, across %d customers. No client is set on the project itself "
                            "because the register covers many." % (len(invoices), len(clients))))
    L("            v_actor_id)")
    L("    RETURNING id INTO v_project_id;")
    L("  END IF;")
    L("")
    L("  -- ---------------------------------------------------------------")
    L("  -- Clients (%d)" % len(clients))
    L("  -- ---------------------------------------------------------------")
    for c in clients:
        L("  INSERT INTO public.clients (workspace_id, name, created_by)")
        L("  SELECT v_workspace_id, %s, v_actor_id" % q(c))
        L("  WHERE NOT EXISTS (SELECT 1 FROM public.clients")
        L("    WHERE workspace_id = v_workspace_id AND name = %s AND deleted_at IS NULL);" % q(c))
    L("")
    L("  -- ---------------------------------------------------------------")
    L("  -- Invoices, line items and payments")
    L("  -- ---------------------------------------------------------------")

    for inv in invoices:
        t = inv["tax"]
        L("")
        L("  -- source row %d%s" % (inv["row"], (" -- " + "; ".join(inv["notes"])) if inv["notes"] else ""))
        L("  SELECT id INTO v_client_id FROM public.clients")
        L("    WHERE workspace_id = v_workspace_id AND name = %s AND deleted_at IS NULL LIMIT 1;" % q(inv["client"]))
        L("  IF NOT EXISTS (SELECT 1 FROM public.invoices")
        L("      WHERE workspace_id = v_workspace_id AND invoice_number = %s AND deleted_at IS NULL) THEN" % q(inv["number"]))

        src = {"sheet_row": inv["row"]}
        if inv["fpn"]:
            src["no_seri_fpn"] = inv["fpn"]
        if inv["po"]:
            src["no_po_customer"] = inv["po"]
        if inv["adm"]:
            src["biaya_adm"] = inv["adm"]
        if inv["pm"]:
            src["plus_minus"] = inv["pm"]
        if t:
            src["stated"] = {k: v for k, v in t["stated"].items() if v is not None}
        if inv["annotated"]:
            src["unattributed_rows"] = inv["annotated"]
        if inv["notes"]:
            src["import_notes"] = inv["notes"]
        import json
        cf = json.dumps({"import": "old_invoice_register", "source": src},
                        ensure_ascii=False, separators=(",", ":"))

        if t is None:
            L("    INSERT INTO public.invoices (")
            L("      workspace_id, client_id, project_id, invoice_number, status, currency,")
            L("      issue_date, title, custom_fields, created_by")
            L("    ) VALUES (")
            L("      v_workspace_id, v_client_id, v_project_id, %s, %s, 'IDR'," % (q(inv["number"]), q(inv["status"])))
            L("      %s, %s, %s::jsonb, v_actor_id" % (q(inv["issue"]), q(inv["ket"]), q(cf)))
            L("    ) RETURNING id INTO v_invoice_id;")
        else:
            L("    INSERT INTO public.invoices (")
            L("      workspace_id, client_id, project_id, invoice_number, status, currency,")
            L("      issue_date, title, subtotal, discount_amount, dpp_numerator, dpp_denominator,")
            L("      ppn_percent, pph_percent, retensi_percent, dpp_amount, ppn_amount,")
            L("      pph_amount, retensi_amount, tax_amount, total, amount_paid, paid_at,")
            L("      custom_fields, created_by")
            L("    ) VALUES (")
            L("      v_workspace_id, v_client_id, v_project_id, %s, %s, 'IDR'," % (q(inv["number"]), q(inv["status"])))
            L("      %s, %s, %.2f, 0, %d, %d," % (q(inv["issue"]), q(inv["ket"]),
                                                  t["harga_jual"], t["dpp_num"], t["dpp_den"]))
            L("      %s, %s, %s, %.2f, %.2f," % (
                "%.3f" % t["ppn_pct"],
                ("%.3f" % t["pph_pct"]) if t["pph_pct"] is not None else "NULL",
                ("%.3f" % t["ret_pct"]) if t["ret_pct"] is not None else "NULL",
                t["dpp_amt"], t["ppn_amt"]))
            paid_at = None
            if inv["status"] == "paid" and inv["pays"]:
                dates = [p["date"] for p in inv["pays"] if p["date"]]
                paid_at = max(dates) if dates else None
            L("      %.2f, %.2f, %.2f, %.2f, %.2f, %s," % (
                t["pph_amt"], t["ret_amt"], t["ppn_amt"], t["total"], inv["paid"],
                (q(paid_at) + "::timestamptz") if paid_at else "NULL"))
            L("      %s::jsonb, v_actor_id" % q(cf))
            L("    ) RETURNING id INTO v_invoice_id;")
            L("")
            L("    INSERT INTO public.line_items (")
            L("      workspace_id, entity_type, entity_id, category, sort_order,")
            L("      description, quantity, unit_price")
            L("    ) VALUES (")
            L("      v_workspace_id, 'invoice', v_invoice_id, 'per_unit', 0,")
            L("      %s, 1, %.2f" % (q(inv["ket"] or "Imported historical invoice"), t["harga_jual"]))
            L("    );")
            for n, pay in enumerate(inv["pays"], start=1):
                pn = "HIST-%s-%d" % (re.sub(r"[^A-Za-z0-9]+", "-", inv["number"]).strip("-"), n)
                L("")
                L("    INSERT INTO public.payments (")
                L("      workspace_id, invoice_id, payment_number, amount, currency,")
                L("      payment_method, payment_date, notes, recorded_by")
                L("    ) VALUES (")
                L("      v_workspace_id, v_invoice_id, %s, %.2f, 'IDR'," % (q(pn), pay["amount"]))
                L("      'bank_transfer', %s, %s, v_actor_id" % (
                    q(pay["date"]), q("Imported from historical register (row %d)" % inv["row"])))
                L("    );")
        L("  END IF;")

    L("")
    L("END $$;")
    return out


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "Raw_2.xlsx"
    rows = load(path)
    clients, invoices, stats = build(rows)
    out = emit(clients, invoices, stats, [])
    dest = "supabase/migrations/00100_import_old_invoice_register.sql"
    with open(dest, "w") as f:
        f.write("\n".join(out) + "\n")

    print("wrote %s" % dest)
    print("  clients : %d" % len(clients))
    print("  invoices: %d" % len(invoices))
    print("  payments: %d" % sum(len(i["pays"]) for i in invoices))
    for k, v in sorted(stats.items()):
        print("  %-38s %d" % (k, v))
    tot = sum(i["tax"]["total"] for i in invoices if i["tax"])
    paid = sum(i["paid"] for i in invoices)
    print("  invoiced total : Rp {:,.0f}".format(tot))
    print("  recorded paid  : Rp {:,.0f}".format(paid))


if __name__ == "__main__":
    main()
