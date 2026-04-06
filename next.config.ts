import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  //cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      // Add more domains if you use other image sources
      // {
      //   protocol: 'https',
      //   hostname: 'your-other-image-domain.com',
      //   port: '',
      //   pathname: '/**',
      // },
    ],
  },
};

export default nextConfig;
