import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      // The Fulfilment Projects module was consolidated into the main
      // Fulfilment workspace (one nav entry, one URL family). These are
      // temporary (307) so they stay easy to adjust while this settles.
      {
        source: "/:workspaceSlug/fulfillment-projects",
        destination: "/:workspaceSlug/fulfillment",
        permanent: false,
      },
      {
        source: "/:workspaceSlug/fulfillment-projects/:invoiceId",
        destination: "/:workspaceSlug/fulfillment?invoice=:invoiceId",
        permanent: false,
      },
      // The per-project workspace was later folded into /fulfillment itself
      // (one page, Client▼/Invoice▼ selectors, no per-project route) — old
      // /fulfillment/[invoiceId] links resolve via the `invoice` query param.
      {
        source: "/:workspaceSlug/fulfillment/:invoiceId",
        destination: "/:workspaceSlug/fulfillment?invoice=:invoiceId",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
