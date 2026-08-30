import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface User {
    role?: string;
    merchantId?: string | null;
    merchantName?: string | null;
    merchantSlug?: string | null;
  }

  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      merchantId: string | null;
      merchantName: string | null;
      merchantSlug: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string;
    merchantId?: string | null;
    merchantName?: string | null;
    merchantSlug?: string | null;
  }
}
