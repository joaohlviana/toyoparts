/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'toyoparts.com.br' },
      { protocol: 'https', hostname: 'www.toyoparts.com.br' },
      { protocol: 'https', hostname: 'hkxjnykrnhjtkkabgece.supabase.co' },
      { protocol: 'https', hostname: 'increazy-folder.s3.amazonaws.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
    ],
  },
};

export default nextConfig;
