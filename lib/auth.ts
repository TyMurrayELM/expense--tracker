import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { supabaseAdmin } from '@/lib/supabase';

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Missing required env vars: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.');
}

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('Missing required env var: NEXTAUTH_SECRET must be set.');
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: 'select_account',
          hd: process.env.ALLOWED_EMAIL_DOMAIN || 'encorelm.com', // Restrict to your domain
        },
      },
    }),
  ],
  
  callbacks: {
    async signIn({ user, account, profile }) {
      // Check if email is from allowed domain
      const email = user.email?.toLowerCase();
      const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || 'encorelm.com';
      
      if (!email || !email.endsWith(`@${allowedDomain}`)) {
        console.log(`Sign-in rejected: ${email} not from ${allowedDomain}`);
        return false;
      }

      // Check if user exists in database
      try {
        const { data: dbUser, error } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('email', email)
          .single();

        // If user doesn't exist, create them with no permissions
        if (error || !dbUser) {
          console.log(`Creating new user: ${email}`);
          
          // Extract name from Google profile or email
          const fullName = user.name || email.split('@')[0].replace(/\./g, ' ');
          
          const { data: newUser, error: insertError } = await supabaseAdmin
            .from('users')
            .insert({
              email: email,
              full_name: fullName,
              is_admin: false,
              is_active: true,
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error creating user:', insertError);
            return '/auth/error?error=DatabaseError';
          }

          console.log(`User created successfully: ${email}`);
          // Don't assign any branches or departments - they start with no access
          return true;
        }

        // User exists - check if active
        if (!dbUser.is_active) {
          console.log(`User account inactive: ${email}`);
          return '/auth/error?error=AccountInactive';
        }

        return true;
      } catch (error) {
        console.error('Error checking user:', error);
        return '/auth/error?error=DatabaseError';
      }
    },

    async session({ session, token }) {
      // Add user info to session
      if (session.user && token.email) {
        try {
          const { data: dbUser } = await supabaseAdmin
            .from('users')
            .select('id, email, full_name, is_admin, is_active')
            .eq('email', token.email.toLowerCase())
            .single();

          if (dbUser) {
            session.user.id = dbUser.id;
            session.user.email = dbUser.email;
            session.user.name = dbUser.full_name;
            session.user.isAdmin = dbUser.is_admin;
            session.user.isActive = dbUser.is_active;
          }
        } catch (error) {
          console.error('Error fetching user session data:', error);
        }
      }

      return session;
    },

    async jwt({ token, user, account }) {
      // Initial sign in
      if (account && user) {
        token.email = user.email?.toLowerCase();
      }
      return token;
    },
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,
};
