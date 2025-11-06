import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/auth/signin',
  },
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /api/auth (auth API routes)
     * - /auth/signin (sign in page)
     * - /auth/error (error page)
     * - /_next/static (static files)
     * - /_next/image (image optimization)
     * - /favicon.ico
     * - /logos (your logo folder)
     * - Any file with an extension (*.png, *.txt, etc.)
     */
    '/((?!api/auth|auth|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};