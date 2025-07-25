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
      // The name to display on the sign in form (e.g. 'Sign in with...')
      name: "Credentials",
      // The credentials is used to generate a suitable form on the sign in page.
      // You can specify whatever fields you are expecting to be submitted.
      // e.g. domain, username, password, 2FA token, etc.
      // You can pass any HTML attribute to the <input> tag through the object.
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
        // // You need to provide your own logic here that takes the credentials
        // // submitted and returns either a object representing a user or value
        // // that is false/null if the credentials are invalid.
        // // e.g. return { id: 1, name: 'J Smith', email: 'jsmith@example.com' }
        // // You can also use the `req` object to obtain additional parameters
        // // (i.e., the request IP address)
        // if (typeof credentials?.email === "undefined" || typeof credentials?.password === "undefined") throw new Error("Please provide your credentials.")

        // // get the params
        // const { email, password } = credentials
        // // check if user exist
        // if (!(await Users.findOne({ email }).exec())) throw new Error("User was not found.")

        // // Get the user
        // const user = await Users.findOne({ email })
        // console.log({ user })
        // // check if password is correct
        // if (!(await bcrypt.compare(password, user?.password))) throw new Error("Invalid password.")

        return { ...user }
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
        session.user = token?.profile._doc
      }

      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export default NextAuth(authOptions)
