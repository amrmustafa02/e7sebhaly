/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@ehsebhaly/types',
    '@ehsebhaly/schemas',
    '@ehsebhaly/calculations',
    '@ehsebhaly/ai',
  ],
};

export default nextConfig;
