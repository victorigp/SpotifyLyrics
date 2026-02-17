import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["NeteaseCloudMusicApi"],
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
