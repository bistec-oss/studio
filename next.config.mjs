/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the Docker prod image: Dockerfile stage 3 copies
  // `.next/standalone` and runs `node server.js` from it.
  output: 'standalone',
  // pdf-parse's pdfjs-dist dependency breaks under bundling ("Object.defineProperty
  // called on non-object") — load it via Node's require at runtime instead.
  // Standalone output traces it into the image. (Renamed from
  // experimental.serverComponentsExternalPackages in Next 15/16.)
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
