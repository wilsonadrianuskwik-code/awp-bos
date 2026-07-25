import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Logs the full PostgREST error (code/message/details/hint) server-side
 * before it gets wrapped into a plain Error and thrown up to a route's
 * error.tsx boundary — Next.js redacts thrown Server Component error
 * messages in production before they reach the client, so without this
 * the only trace of *why* a query failed (missing table, RLS denial,
 * bad column name, etc.) would be lost entirely instead of showing up
 * in server logs.
 */
export function logDbError(context: string, error: PostgrestError, meta?: Record<string, unknown>) {
  console.error(`[db] ${context} failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    ...meta,
  });
}
