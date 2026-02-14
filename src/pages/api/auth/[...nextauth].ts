import { Users } from "@Jetzy/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import { ensureDbConnected } from "@/configs/database"
import NextAuth, { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcrypt"
import { AuthorizeSSOApi, SignupSSOApi } from "@Jetzy/services/auth/authapis"

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
          // Ensure database connection is ready before any queries
          await ensureDbConnected();
          console.log('✅ Database connection verified');

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
            const externalApiUrl = process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || 'https://test.jetzy.com';
            const loginEndpoint = `${externalApiUrl}/api/v1/accounts/authorize`;
            console.log('--- Authorize Debug Start ---');
            console.log('Attempting external login to:', loginEndpoint);
            console.log('Credentials provided - email:', email, 'hasPassword:', !!password);

            // Create abort controller for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

            const externalLoginRes = await fetch(loginEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            console.log('External fetch response status:', externalLoginRes.status, externalLoginRes.statusText);

            if (externalLoginRes.ok) {
              const externalData = await externalLoginRes.json();
              console.log('External login response data:', JSON.stringify(externalData).substring(0, 500));
              if (externalData && (externalData.status || externalData.success)) {
                accessToken = externalData.data?.accessToken;
                console.log('Fetched external accessToken successfully:', accessToken ? 'YES (masked)' : 'NO (missing in data)');
              } else {
                console.warn('External login returned success=false/status=false:', externalData.message || 'No message');
              }
            } else {
              console.log('External login failed with status:', externalLoginRes.status);
              const errorText = await externalLoginRes.text();
              console.log('Error body:', errorText.substring(0, 100));
            }

            // JIT SYNC: If we have a local user but no external token, try to register them externally
            if (!accessToken) {
              console.log('🔄 Attempting JIT External Sync for user:', email);
              const createEndpoint = `${externalApiUrl}/api/v1/accounts/create`;

              // Map local user fields to external API format
              const syncPayload = {
                firstName: user.firstName,
                lastName: user.lastName,
                email: email,
                password: password,
                role: user.role || 'user'
              };

              console.log('JIT Sync Endpoint:', createEndpoint);

              const createRes = await fetch(createEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(syncPayload)
              });

              console.log('JIT Sync response status:', createRes.status);

              if (createRes.ok || createRes.status === 409) {
                if (createRes.status === 409) {
                  console.log('ℹ️ User already exists externally (409), proceeding to retry login');
                } else {
                  console.log('✅ JIT Sync (registration) successful');
                }

                // Retry login now that user should exist externally
                console.log('Retrying external login...');
                const retryLoginRes = await fetch(loginEndpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, password }),
                });

                if (retryLoginRes.ok) {
                  const retryData = await retryLoginRes.json();
                  if (retryData && (retryData.status || retryData.success)) {
                    accessToken = retryData.data?.accessToken;
                    console.log('✅ Fetched accessToken after JIT sync retry');
                  }
                } else {
                  console.warn('Retry login failed after JIT sync:', retryLoginRes.status);
                }
              } else {
                const createErrorText = await createRes.text();
                console.error('❌ JIT Sync failed:', createRes.status, createErrorText.substring(0, 100));
              }
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              console.error('External token fetch timeout after 8 seconds');
            } else {
              console.error('External token fetch error:', err.message || err);
            }
          }
          console.log('--- Authorize Debug End ---');

          const userData = {
            _id: user._id.toString(),
            id: user._id.toString(),
            name: `${user.firstName} ${user.lastName}`,
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
          console.error("❌ Authorization error:", error.message || error);
          throw error;
        }
      },
    }),
    CredentialsProvider({
      id: "firebase-auth",
      name: "Firebase",
      credentials: {
        idToken: { label: "ID Token", type: "text" },
        name: { label: "Name", type: "text" },
        email: { label: "Email", type: "text" },
        image: { label: "Image", type: "text" },
      },
      async authorize(credentials, req) {
        console.log("--- Firebase Auth API Start ---");
        try {
          const { idToken, name: nameFromFront, email: emailFromFront, image: imageFromFront } = credentials ?? {};
          if (!idToken) {
            console.error("❌ Firebase Auth: No idToken provided");
            throw new Error("ID Token is required");
          }

          // Ensure database connection
          await ensureDbConnected();

          // Verify the token using firebase-admin
          const { verifyIdToken } = await import("@/configs/firebase-admin");
          console.log("Firebase Auth: Verifying token...");
          const decodedToken = await verifyIdToken(idToken);

          if (!decodedToken && !emailFromFront) {
            console.error("❌ Firebase Auth: Token verification failed and no fallback email provided");
            throw new Error("Invalid ID Token or missing credentials");
          }

          const { email: emailFromToken, name: nameFromToken, picture: imageFromToken, uid } = (decodedToken as any) || {};
          const email = emailFromToken || emailFromFront;
          const name = nameFromToken || nameFromFront;
          const image = imageFromToken || imageFromFront;

          if (!email) {
            console.error("❌ Firebase Auth: Email not found in decoded token or credentials");
            throw new Error("Email not found in token");
          }

          console.log(`Firebase Auth: Decoded token for email: ${email}, UID: ${uid}`);

          // --- JETZY SSO INTEGRATION ---
          let accessToken = null;
          const ssoPayload = {
            name: name || "User",
            email: email,
            image: image || "",
            token: idToken,
            platform: "web" as const
          };

          console.log("Attempting Jetzy SSO Authorization...");
          try {
            const authRes = await AuthorizeSSOApi({ data: ssoPayload });
            if (authRes?.status || (authRes as any)?.success) {
              console.log("✅ Jetzy SSO Authorization successful");
              accessToken = authRes.data?.accessToken;
            } else {
              console.log("Jetzy SSO Authorization failed, attempting Signup...");
              const signupRes = await SignupSSOApi({ data: ssoPayload });
              if (signupRes?.status || (signupRes as any)?.success) {
                console.log("✅ Jetzy SSO Signup successful");
                accessToken = signupRes.data?.accessToken;
              } else {
                console.warn("Jetzy SSO Signup also failed:", (signupRes as any)?.message || "No message");
              }
            }
          } catch (ssoError: any) {
            console.error("Jetzy SSO API Error:", ssoError?.message || ssoError);
          }

          // Look for user in both collections (Existing database lookup)
          console.log("Firebase Auth: Looking for user in database...");
          let user = await EventUsers.findOne({ email });
          if (!user) {
            console.log(`Firebase Auth: User not found in EventUsers, checking Users...`);
            user = await Users.findOne({ email });
          }

          // If user doesn't exist, create a new one (Social Signup)
          if (!user) {
            console.log(`Firebase Auth: User ${email} not found, creating new account...`);
            const firstName = name?.split(" ")[0] || "User";
            const lastName = name?.split(" ").slice(1).join(" ") || "";

            // Create in EventUsers by default
            user = await EventUsers.create({
              firstName,
              lastName,
              email,
              image: image,
              role: "user",
              isVerified: true,
              authProvider: "firebase",
              firebaseUid: uid,
            });
            console.log(`✅ Firebase Auth: New user created: ${user._id}`);
          } else {
            console.log(`✅ Firebase Auth: User found: ${user._id}`);
          }

          console.log("--- Firebase Auth API Success ---");
          return {
            _id: user._id.toString(),
            id: user._id.toString(),
            name: `${user.firstName} ${user.lastName}`,
            fullName: `${user.firstName} ${user.lastName}`,
            email: user.email,
            role: user.role,
            accessToken: accessToken, // Now using Jetzy SSO token
            ...(user.image ? { image: user.image } : {}),
          };
        } catch (error: any) {
          console.error("❌ Firebase Auth error:", error.message);
          console.error("Error details:", error);
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
