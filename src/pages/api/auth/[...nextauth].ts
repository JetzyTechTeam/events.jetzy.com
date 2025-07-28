import { Users } from "@Jetzy/models/userModal"
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
      },

      async authorize(credentials, req) {
        const { email, password } = credentials ?? {};

        if (!email || !password) throw new Error("Please provide your credentials.");

        const user = await Users.findOne({ email }).select('+password');
        if (!user) throw new Error("User was not found.");

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) throw new Error("Invalid password.");

          return {
            id: user._id.toString(),
            fullName: `${user.firstName} ${user.lastName}`,
            email: user.email,
            image: user.image,
            role: user.role,
          };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
    signOut: "/login",
  },
  callbacks: {
    async jwt({ token, user, profile }) {
      if (user) {
        token.profile = user
      }
      return token
    },

    async session({ session, user, token }) {
      //   @ts-ignore
      if (token?.profile) {
        // @ts-ignore
        session.user = {
           // @ts-ignore
           _id: token?.profile?._doc?._id,
           // @ts-ignore
           fullName: `${token?.profile?._doc?.firstName} ${token?.profile?._doc?.lastName}`,
           // @ts-ignore
           email: token?.profile?._doc?.email,
           // @ts-ignore
           image: token?.profile?._doc?.image,
           // @ts-ignore
          role: token?.profile?._doc?.role,
        }
      }

      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export default NextAuth(authOptions)
