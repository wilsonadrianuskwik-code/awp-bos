import type { Condition, VisibilityRule } from "@/features/templates/types";
import type { DocumentRenderData } from "@/features/templates/renderer/types";

function getByPath(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, data);
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function evaluateCondition(condition: Condition, data: DocumentRenderData): boolean {
  const actual = getByPath(data, condition.field);

  switch (condition.operator) {
    case "empty":
      return isEmpty(actual);
    case "not_empty":
      return !isEmpty(actual);
    case "eq":
      return actual === condition.value;
    case "neq":
      return actual !== condition.value;
    case "gt":
      return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
    case "lt":
      return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
    case "gte":
      return typeof actual === "number" && typeof condition.value === "number" && actual >= condition.value;
    case "lte":
      return typeof actual === "number" && typeof condition.value === "number" && actual <= condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case "contains":
      return typeof actual === "string" && typeof condition.value === "string" && actual.includes(condition.value);
    default:
      return true;
  }
}

// A block/row with no visibility rule is always visible — the rule is
// strictly opt-in. `show_when` renders only if the logic evaluates to
// true; `hide_when` renders only if it evaluates to false.
export function evaluateVisibility(
  rule: VisibilityRule | undefined,
  data: DocumentRenderData
): boolean {
  if (!rule || rule.conditions.length === 0) return true;

  const results = rule.conditions.map((c) => evaluateCondition(c, data));
  const combined = rule.logic === "any" ? results.some(Boolean) : results.every(Boolean);

  return rule.action === "show_when" ? combined : !combined;
}
