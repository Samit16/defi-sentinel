/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  images: { unoptimized: true },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:5000";
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};
export default nextConfig;
