import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["NeteaseCloudMusicApi", "xml2js", "pac-proxy-agent"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lastfm.freetls.fastly.net",
      },
      {
        protocol: "https",
        hostname: "i.scdn.co",
      }
    ],
  },
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/xml2js/**/*",
      "./node_modules/pac-proxy-agent/**/*",
      "./node_modules/crypto-js/**/*",
      "./node_modules/md5/**/*",
      "./node_modules/music-metadata/**/*",
      "./node_modules/node-forge/**/*",
      "./node_modules/qrcode/**/*",
      "./node_modules/safe-decode-uri-component/**/*",
      "./node_modules/tunnel/**/*",
      "./node_modules/axios/**/*"
    ],
  },
};

export default nextConfig;
