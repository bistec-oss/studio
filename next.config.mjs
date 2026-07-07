/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the Docker prod image: Dockerfile stage 3 copies
  // `.next/standalone` and runs `node server.js` from it.
  output: 'standalone',
  experimental: {
    // pdf-parse's pdfjs-dist dependency breaks under webpack RSC bundling
    // ("Object.defineProperty called on non-object") — load it via Node's
    // require at runtime instead. Standalone output traces it into the image.
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  },
};

export default nextConfig;
