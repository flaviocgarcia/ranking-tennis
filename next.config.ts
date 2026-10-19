import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Recursos da infraestrutura (Vercel já comprime e cacheia /_next/static).
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Sem otimização de imagens: a primeira versão não usa fotografias
  // (avatares são iniciais em CSS), portanto nenhum serviço pago de
  // Image Optimization é acionado.
  images: { unoptimized: true },
};

export default nextConfig;
