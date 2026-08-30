import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req: NextRequest & { auth: any }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  console.log('[Middleware] Path:', pathname);
  console.log('[Middleware] Session:', session ? 'Valid' : 'Null');

  if (pathname.startsWith('/merchant') && !session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (pathname.startsWith('/admin')) {
    if (!session) return NextResponse.redirect(new URL('/login', req.url));
    if (session.user?.role !== 'admin') return NextResponse.redirect(new URL('/merchant/dashboard', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/merchant/:path*', '/admin/:path*'],
};
