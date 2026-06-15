import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";
import { spawnSync } from "node:child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf-8",
  }).stdout?.trim() ?? crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable:
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_ENABLE_SW !== "true",
  cacheOnNavigation: true,
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Turbopack (dev mode) needs its own alias config - it ignores webpack().
  // web-tree-sitter has a conditional require('fs'/'path') for its Node.js
  // code path; in the browser that branch is dead but Turbopack still
  // resolves the import at build time. Point both to an empty shim.
  turbopack: {
    resolveAlias: {
      fs: "./lib/browser-empty.js",
      path: "./lib/browser-empty.js",
    },
  },
  webpack(config, { isServer }) {
    // onnxruntime-node contains native binaries (.node) that webpack cannot
    // parse. Alias it to false so webpack emits an empty module instead.
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-node": false,
    };
    if (!isServer) {
      // web-tree-sitter has a conditional require('fs') for its Node.js code
      // path. resolve.alias:false silently returns an empty module at build
      // time - resolve.fallback:false does not suppress the "Module not found"
      // error, which is why we use alias here instead.
      config.resolve.alias = {
        ...config.resolve.alias,
        fs: false,
        path: false,
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
  outputFileTracingRoot:
    process.env.NODE_ENV === "production"
      ? path.join(__dirname, "../../")
      : undefined,
  allowedDevOrigins: ["127.0.0.1", "*"],
  logging: { incomingRequests: false },
  images: {
    dangerouslyAllowLocalIP: true,
    qualities: [75, 80, 85, 90],
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
      },
      {
        protocol: "https",
        hostname: "r2.iguzman.com.mx",
      },
    ],
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withSerwist(withNextIntl(nextConfig));
