import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone", // lean container image for BWH deploy
};

export default nextConfig;
