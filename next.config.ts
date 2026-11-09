import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const X402_OPTIONAL = [
  "@x402/core", "@x402/core/client", "@x402/core/schemas", "@x402/core/server",
  "@x402/evm", "@x402/evm/auth-capture/client", "@x402/evm/batch-settlement/client", "@x402/evm/exact/client",
  "@x402/evm/exact/server", "@x402/evm/exact/v1/client", "@x402/evm/upto/client", "@x402/evm/upto/server",
  "@x402/express", "@x402/extensions/bazaar", "@x402/extensions/builder-code", "@x402/fetch",
  "@x402/svm", "@x402/svm/exact/client", "@x402/svm/exact/server", "@x402/svm/exact/v1/client",
  "@x402/svm/upto/client", "@x402/svm/upto/server",
  // Same chain, optional "machine payments" client.
  "mppx", "mppx/client", "mppx/server",
];

const nextConfig: NextConfig = {
  // The widget ships ESM that references `window` lazily; let Next transpile it.
  transpilePackages: ["@x402identity/widget-react", "@x402identity/widget-core"],
  webpack: (config) => {
    // WalletConnect optional deps that are not needed in the browser bundle.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // @reown/appkit-adapter-wagmi → @wagmi/connectors → @base-org/account → @coinbase/cdp-sdk
    // dynamically imports @x402/* packages that are not installed or used here.
    // Every deep specifier needs its own alias: aliasing "@x402/evm" does not cover "@x402/evm/exact/client".
    config.resolve.alias = { ...config.resolve.alias, ...Object.fromEntries(X402_OPTIONAL.map((m) => [m, false])) };
    return config;
  },
};

export default nextConfig;

// Gives `next dev` access to D1/KV bindings through getCloudflareContext().
initOpenNextCloudflareForDev();
