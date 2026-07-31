#!/usr/bin/env python3
"""
Adds an explicit created_at to every invoices/purchase_orders/line_items
INSERT in 00095_import_historical_data.sql, and every payments INSERT in
00096_backfill_historical_payments.sql -- same bug as 00100 originally
had: neither file ever set created_at, so every row silently took the
column's own DEFAULT now() instead of the historical date it represents.

A plain regex is not safe here: some line_items description text contains
literal parentheses (e.g. "NIPPON PLATONE 8000 818(600) VERMILION"), which
would fool a naive "up to the first )" match into truncating a VALUES
tuple early. This scans respecting SQL string-literal quoting ('' as an
escaped quote) and paren depth, so it finds the *true* closing paren of
each column list and VALUES tuple regardless of what the description text
contains.

invoices and purchase_orders both carry issue_date directly in their own
VALUES tuple; line_items don't have a date of their own, so each one
inherits whatever issue_date was most recently seen while scanning the
file in order -- correct because every line_items block in this file
immediately follows the parent invoice/PO insert that set the id it
references, within the same DECLARE ... BEGIN ... END scope.
"""
import re
import sys


def find_matching_paren(s, open_idx):
    """s[open_idx] is '('. Return the index of its matching ')',
    respecting single-quoted string literals ('' is an escaped quote,
    not a closed-then-reopened string)."""
    depth = 0
    i = open_idx
    in_string = False
    while i < len(s):
        c = s[i]
        if in_string:
            if c == "'":
                if s[i:i + 2] == "''":
                    i += 2
                    continue
                in_string = False
        else:
            if c == "'":
                in_string = True
            elif c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    raise ValueError("unbalanced parens from index %d" % open_idx)


def split_top_level(s):
    """Split a VALUES-tuple's inner text on top-level commas only --
    commas inside a quoted string or inside a nested (...) don't split."""
    parts, depth, cur, in_string = [], 0, "", False
    i = 0
    while i < len(s):
        c = s[i]
        if in_string:
            cur += c
            if c == "'":
                if s[i:i + 2] == "''":
                    cur += "'"
                    i += 2
                    continue
                in_string = False
            i += 1
            continue
        if c == "'":
            in_string = True
            cur += c
        elif c == "(":
            depth += 1
            cur += c
        elif c == ")":
            depth -= 1
            cur += c
        elif c == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += c
        i += 1
    parts.append(cur)
    return [p.strip() for p in parts]


def wib(date_literal):
    """date_literal is a quoted SQL string like 'YYYY-MM-DD'."""
    return "(%s::timestamp AT TIME ZONE 'Asia/Jakarta')" % date_literal


def patch(path, tables, date_col_of, inherit_date=False):
    """
    tables: set of table names to patch (matched right after
      'INSERT INTO public.').
    date_col_of: {table_name: column_name} the date column lives in that
      table's own VALUES tuple (used to both extract it and, for
      inherit_date=False tables, compute created_at from it directly).
    inherit_date: if True, tables not in date_col_of borrow the most
      recently seen date literal from a table that IS in date_col_of
      (used for line_items borrowing their parent's issue_date).
    """
    s = open(path).read()
    out = []
    i = 0
    current_date_literal = None
    n_patched = {t: 0 for t in tables}

    pat = re.compile(r"INSERT INTO public\.(%s) \(" % "|".join(sorted(tables)))
    while True:
        m = pat.search(s, i)
        if not m:
            out.append(s[i:])
            break
        table = m.group(1)
        col_open = m.end() - 1  # index of the '(' the regex matched
        out.append(s[i:col_open + 1])  # everything up to AND INCLUDING '('

        col_close = find_matching_paren(s, col_open)
        col_text = s[col_open + 1:col_close]

        # find "VALUES (" right after the column list
        vm = re.search(r"\s*VALUES\s*\(", s[col_close + 1:col_close + 40])
        if not vm:
            raise ValueError("no VALUES after column list at %d" % col_close)
        val_open = col_close + 1 + vm.end() - 1
        val_close = find_matching_paren(s, val_open)
        val_text = s[val_open + 1:val_close]

        if table in date_col_of:
            cols = [c.strip() for c in col_text.split(",")]
            vals = split_top_level(val_text)
            idx = cols.index(date_col_of[table])
            current_date_literal = vals[idx].strip()
            date_expr = wib(current_date_literal)
        elif inherit_date:
            if current_date_literal is None:
                raise ValueError("line_items block with no prior date at %d" % col_open)
            date_expr = wib(current_date_literal)
        else:
            raise ValueError("table %s has no date source" % table)

        # column list: '...col_text)' -> '...col_text, created_at)'
        out.append(col_text + ", created_at)")
        out.append(s[col_close + 1:val_open + 1])  # "VALUES (" incl. the '('
        # values: '...val_text)' -> '...val_text, <expr>)'
        out.append(val_text + ", " + date_expr + ")")

        n_patched[table] += 1
        i = val_close + 1

    open(path, "w").write("".join(out))
    return n_patched


if __name__ == "__main__":
    n95 = patch(
        "supabase/migrations/00095_import_historical_data.sql",
        tables={"invoices", "purchase_orders", "line_items"},
        date_col_of={"invoices": "issue_date", "purchase_orders": "issue_date"},
        inherit_date=True,
    )
    print("00095:", n95)

    n96 = patch(
        "supabase/migrations/00096_backfill_historical_payments.sql",
        tables={"payments"},
        date_col_of={"payments": "payment_date"},
        inherit_date=False,
    )
    print("00096:", n96)
