import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No serverActions config needed — file uploads go directly to Supabase Storage
  // bypassing Next.js, so there's no body size limit issue
};

export default nextConfig;
