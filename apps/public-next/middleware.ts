import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function getLegacyOrigin() {
  return (process.env.LEGACY_ORIGIN || process.env.NEXT_PUBLIC_LEGACY_ORIGIN || '').replace(/\/$/, '');
}

export function middleware(request: NextRequest) {
  const legacyOrigin = getLegacyOrigin();

  if (!legacyOrigin) {
    return NextResponse.next();
  }

  const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, legacyOrigin);
  return NextResponse.rewrite(target);
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/checkout/:path*',
    '/acesso',
    '/auth/:path*',
    '/minha-conta/:path*',
    '/busca',
    '/busca/:path*',
  ],
};
