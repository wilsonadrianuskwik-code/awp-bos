/**
 * Makes a user's search box input safe to interpolate into a PostgREST
 * filter string.
 *
 * PostgREST's `.or()` takes one string where **comma separates the
 * clauses** and parentheses group them. The term is interpolated straight
 * into that string, so a comma in the search box ends the clause early
 * and the remainder is parsed as a new, malformed one — PostgREST
 * answers 400 and the list page throws to its error boundary.
 *
 * That is not an edge case here: Indonesian company names routinely carry
 * commas ("PT DUTA RAMA - PT GALA KARYA, KSO") and product specs carry
 * parentheses ("NIPPON PLATONE 8000 818(600)"). Searching for a real
 * client by name took the page down.
 *
 * Stripped rather than escaped: PostgREST has no escape syntax for these
 * inside an `or` string, and quoting the value brings its own quoting
 * problem. Dropping the punctuation widens the match slightly — "GALA
 * KARYA KSO" instead of "GALA KARYA, KSO" — which is the right failure
 * direction for a search box.
 *
 *   `%` `_`   LIKE wildcards — would let a user match everything
 *   `,`       PostgREST clause separator
 *   `(` `)`   PostgREST grouping
 *   `.`       separates column.operator.value inside a clause
 *   `"`       PostgREST quoting
 *   `\`       escape character
 */
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[%_,()."\\]/g, " ").replace(/\s+/g, " ").trim();
}
