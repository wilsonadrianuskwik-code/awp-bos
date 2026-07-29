import { useMemo } from "react";
import type { CatalogItem, CatalogItemClientPrice } from "@/features/catalog/types";

/**
 * Resolves the price to show/insert for a catalog item given the
 * document's currently selected client — a client's override (00094)
 * when one exists, otherwise the item's own default price. Shared across
 * the Quotation/Invoice/Proforma Invoice builders since all three price
 * against a client the same way.
 */
export function useClientPriceResolver(
  clientPrices: CatalogItemClientPrice[],
  clientId: string
) {
  const overrides = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of clientPrices) {
      map[`${p.catalog_item_id}:${p.client_id}`] = p.unit_price;
    }
    return map;
  }, [clientPrices]);

  return useMemo(
    () =>
      function priceFor(item: CatalogItem): number {
        if (item.is_package) return item.package_price ?? 0;
        if (clientId) {
          const override = overrides[`${item.id}:${clientId}`];
          if (override !== undefined) return override;
        }
        return item.default_unit_price;
      },
    [overrides, clientId]
  );
}
