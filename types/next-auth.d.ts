import NextAuth, { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      isAdmin: boolean;
      isActive: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
    isActive: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    isAdmin: boolean;
    isActive: boolean;
  }
}
