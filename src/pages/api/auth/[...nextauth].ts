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

        // Try to get external token
        try {
          console.log('Attempting external login to:', `https://prod-api.jetzy.com/api/v1/accounts/authorize`);
          const externalLoginRes = await fetch(`https://prod-api.jetzy.com/api/v1/accounts/authorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });

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
        } catch (err) {
          console.error('External token fetch error:', err);
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
        return userData;
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
      }

      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export default NextAuth(authOptions)
