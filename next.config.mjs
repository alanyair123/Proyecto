/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.E2E_TEST_AUTH === "true" ? ".next-e2e" : ".next",
  outputFileTracing: false,
};

export default nextConfig;
