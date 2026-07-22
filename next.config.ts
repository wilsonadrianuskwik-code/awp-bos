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
        destination: "/:workspaceSlug/fulfillment/:invoiceId",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
