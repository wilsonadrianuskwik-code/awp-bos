import { z } from "zod/v4";
import { ITEM_TYPES } from "@/features/catalog/types";
import { LINE_ITEM_CATEGORIES } from "@/features/line-items/types";

// A single breakdown line of a package. Submitted from the form as a JSON
// string under `package_items` and parsed below. Empty-string product_id
// (a free-form line) normalizes to null.
export const packageItemSchema = z.object({
  product_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  name: z.string().min(1, "Item name is required").max(255),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unit: z
    .string()
    .max(50)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  note: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});

// package_items comes over FormData as a JSON string; parse then validate
// each entry. Absent/blank → empty array (a standalone item).
const packageItemsField = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw) return [] as z.infer<typeof packageItemSchema>[];
    try {
      const parsed = JSON.parse(raw);
      const result = z.array(packageItemSchema).safeParse(parsed);
      if (!result.success) {
        ctx.addIssue({ code: "custom", message: result.error.issues[0].message });
        return z.NEVER;
      }
      return result.data;
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid package items" });
      return z.NEVER;
    }
  });

export const createCatalogItemSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(255),
    description: z.string().max(2000).optional().or(z.literal("")),
    sku: z.string().max(100).optional().or(z.literal("")),
    item_type: z.enum(ITEM_TYPES).default("service"),
    default_category: z.enum(LINE_ITEM_CATEGORIES).default("per_unit"),
    default_unit_price: z.coerce.number().min(0, "Price cannot be negative").default(0),
    default_unit: z.string().max(50).optional().or(z.literal("")),
    currency: z.string().length(3),
    // Same enum+transform posture as is_active — a plain "true"/"false"
    // string from a Select, not a checkbox (which serializes as "on"/absent
    // and would confuse z.coerce.boolean).
    is_package: z
      .enum(["standalone", "package"])
      .default("standalone")
      .transform((v) => v === "package"),
    package_price: z.coerce.number().min(0, "Package price cannot be negative").optional(),
    package_items: packageItemsField,
    // Backed by a Select ("active"/"inactive"), not a checkbox — checkbox
    // values serialize as "on"/absent in FormData, and z.coerce.boolean()
    // would treat the literal string "false" as true. An explicit enum +
    // transform avoids both footguns.
    is_active: z
      .enum(["active", "inactive"])
      .default("active")
      .transform((v) => v === "active"),
  })
  .refine((data) => !data.is_package || (data.package_items?.length ?? 0) > 0, {
    message: "A package needs at least one item",
    path: ["package_items"],
  })
  .refine((data) => !data.is_package || data.package_price !== undefined, {
    message: "A package needs a price",
    path: ["package_price"],
  });

// Partial for updates: the create schema is an object wrapped in refinements,
// so rebuild a partial object with the same field defs plus the same
// package refinements (a plain .partial() can't reach through .refine()).
export const updateCatalogItemSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(255).optional(),
    description: z.string().max(2000).optional().or(z.literal("")),
    sku: z.string().max(100).optional().or(z.literal("")),
    item_type: z.enum(ITEM_TYPES).optional(),
    default_category: z.enum(LINE_ITEM_CATEGORIES).optional(),
    default_unit_price: z.coerce.number().min(0, "Price cannot be negative").optional(),
    default_unit: z.string().max(50).optional().or(z.literal("")),
    currency: z.string().length(3).optional(),
    is_package: z
      .enum(["standalone", "package"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "package")),
    package_price: z.coerce.number().min(0, "Package price cannot be negative").optional(),
    package_items: packageItemsField,
    is_active: z
      .enum(["active", "inactive"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "active")),
  })
  .refine((data) => data.is_package !== true || (data.package_items?.length ?? 0) > 0, {
    message: "A package needs at least one item",
    path: ["package_items"],
  })
  .refine((data) => data.is_package !== true || data.package_price !== undefined, {
    message: "A package needs a price",
    path: ["package_price"],
  });

export type PackageItemInput = z.infer<typeof packageItemSchema>;
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
