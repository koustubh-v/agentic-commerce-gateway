import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.merchantId = (user as any).merchantId;
        token.merchantName = (user as any).merchantName;
        token.merchantSlug = (user as any).merchantSlug;
      }
      return token;
    },
    session({ session, token }) {
      session.user.role = token.role as string;
      session.user.merchantId = token.merchantId as string | null;
      session.user.merchantName = token.merchantName as string | null;
      session.user.merchantSlug = token.merchantSlug as string | null;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
} satisfies NextAuthConfig;
