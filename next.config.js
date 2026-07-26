/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverComponentsExternalPackages: ['bcryptjs'],
    // data/ nằm ngoài public/ nên không tự được đóng gói khi deploy — khai báo
    // để corpus đi kèm serverless function của các API route.
    outputFileTracingIncludes: {
      '/api/**': ['./data/chunks.jsonl'],
    },
  }
}
module.exports = nextConfig
