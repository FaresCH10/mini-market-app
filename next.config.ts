import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  //cacheComponents: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'upload.wikimedia.org', pathname: '/**' },
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/**' },
      { protocol: 'https', hostname: '*.supabase.in', pathname: '/**' },
      { protocol: 'https', hostname: '*.googleusercontent.com', pathname: '/**' },
      { protocol: 'https', hostname: '*.amazonaws.com', pathname: '/**' },
      { protocol: 'https', hostname: '*.cdninstagram.com', pathname: '/**' },
      // Allow any https image source (broad fallback)
      { protocol: 'https', hostname: '**', pathname: '/**' },
    ],
  },
};

export default nextConfig;
