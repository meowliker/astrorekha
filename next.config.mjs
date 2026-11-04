/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/google-ads", destination: "/discover", permanent: true },
      { source: "/google-ads/onboarding/:path*", destination: "/discover/onboarding/:path*", permanent: true },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-4f25ef2777b741de8ca7d6f9d52414dc.r2.dev",
      },
      {
        protocol: "https",
        hostname: "assets.astrorekha.com",
      },
    ],
  },
};

export default nextConfig;
