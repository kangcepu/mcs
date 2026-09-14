/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "mcs.padmoasm.com" },
    ],
  },
};

export default nextConfig;
