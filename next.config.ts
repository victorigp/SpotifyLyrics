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
};

export default nextConfig;
