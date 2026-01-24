import { Users } from "@Jetzy/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import NextAuth, { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcrypt"

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text", placeholder: "Email Address" },
        password: { label: "Password", type: "password" },
        isJetzyMember: { label: "isJetzyMember", type: "text" }

      },

      // @ts-ignore
      async authorize(credentials, req) {
        try {
          const { email, password, isJetzyMember: isJetzyMemberRaw } = credentials ?? {};
          const isJetzyMember = String(isJetzyMemberRaw) === "true";

          console.log('--- Authorize Debug ---');
          console.log('Email:', email);
          console.log('isJetzyMember:', isJetzyMember, `(raw: ${isJetzyMemberRaw})`);

          if (!email || !password) throw new Error("Please provide your credentials.");

          let user = null;
          let userModel = isJetzyMember ? EventUsers : Users;

          user = await userModel.findOne({ email }).select('+password');

          // Fallback: Check the other collection if not found
          if (!user) {
            console.log(`User not found in ${isJetzyMember ? 'EventUsers' : 'Users'}, checking other collection...`);
            userModel = isJetzyMember ? Users : EventUsers;
            user = await userModel.findOne({ email }).select('+password');
          }

          if (!user) {
            console.log('User not found in either collection');
            throw new Error("User was not found.");
          }

          const isPasswordCorrect = await bcrypt.compare(password, user.password);
          if (!isPasswordCorrect) {
            console.log('Password mismatch');
            throw new Error("Invalid password.");
          }

          let accessToken = null;

          // Try to get external token with timeout
          try {
            console.log('Attempting external login to:', `https://prod-api.jetzy.com/api/v1/accounts/authorize`);

            // Create abort controller for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

            const externalLoginRes = await fetch(`https://prod-api.jetzy.com/api/v1/accounts/authorize`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (externalLoginRes.ok) {
              const externalData = await externalLoginRes.json();
              console.log('External login response status:', externalData.status || externalData.success);
              if (externalData && (externalData.status || externalData.success)) {
                accessToken = externalData.data?.accessToken;
                console.log('Fetched external accessToken successfully');
              }
            } else {
              console.log('External login failed with status:', externalLoginRes.status);
              const errorText = await externalLoginRes.text();
              console.log('Error body:', errorText.substring(0, 100));
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              console.error('External token fetch timeout after 8 seconds');
            } else {
              console.error('External token fetch error:', err.message || err);
            }
            // Continue without external token - don't crash the function
          }

          const userData = {
            _id: user._id.toString(),
            id: user._id.toString(),
            fullName: `${user.firstName} ${user.lastName}`,
            email: user.email,
            role: user.role,
            accessToken: accessToken,
            ...(user.image ? { image: user.image } : {}),
          };

          console.log('Returning userData, hasToken:', !!accessToken);
          if (accessToken) {
            console.log('✅ External accessToken will be available in session');
          } else {
            console.warn('⚠️ No external accessToken - session will not have accessToken');
          }
          return userData;
        } catch (error: any) {
          console.error('❌ Authorization error:', error.message || error);
          // Re-throw the error so NextAuth can handle it properly
          throw error;
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
    signOut: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.profile = user
        // @ts-ignore
        token.accessToken = user.accessToken
      }
      return token
    },

    async session({ session, token }) {
      if (token?.profile) {
        // @ts-ignore
        session.user = token.profile
        // @ts-ignore
        session.accessToken = token.accessToken

        console.log('📦 Session callback - accessToken:', token.accessToken ? 'EXISTS (masked)' : 'MISSING');
      }

      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export default NextAuth(authOptions)
