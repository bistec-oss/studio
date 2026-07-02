/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the Docker prod image: Dockerfile stage 3 copies
  // `.next/standalone` and runs `node server.js` from it.
  output: 'standalone',
};

export default nextConfig;
