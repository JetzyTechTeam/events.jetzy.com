import { Users } from "@Jetzy/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import { ensureDbConnected } from "@/configs/database"
import NextAuth, { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcrypt"
import { AuthorizeSSOApi, SignupSSOApi } from "@Jetzy/services/auth/authapis"
import { verifyMagicToken } from "@/lib/magicLink"

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
        isJetzyMember: { label: "isJetzyMember", type: "text" },
        magicToken: { label: "Magic Token", type: "text" }
      },

      // @ts-ignore
      async authorize(credentials, req) {
        try {
          // Ensure database connection is ready before any queries
          await ensureDbConnected();
          console.log('✅ Database connection verified');

          const { email: emailInput, password: passwordInput, isJetzyMember: isJetzyMemberRaw, magicToken } = credentials ?? {};
          const isJetzyMember = String(isJetzyMemberRaw) === "true";

          let email = emailInput;
          let password = passwordInput;

          console.log('--- Authorize Debug ---');
          let isMagicLogin = false;
          let magicTokenData = null;
          if (magicToken) {
            console.log('Magic Token provided, verifying...');
            magicTokenData = verifyMagicToken(magicToken);
            if (!magicTokenData) {
              console.error('Invalid or expired magic token');
              throw new Error("Invalid auto-login link.");
            }
            console.log('Magic Token verified for:', magicTokenData.email || `ID: ${magicTokenData._id}`);
            
            // If email is missing but _id is present, attempt to find user by ID
            if (!magicTokenData.email && magicTokenData._id) {
              console.log('Token has no email, searching by _id:', magicTokenData._id);
              const userById = await EventUsers.findById(magicTokenData._id).lean() 
                             || await Users.findById(magicTokenData._id).lean();
              if (userById) {
                console.log('Found user by ID, using email:', (userById as any).email);
                email = (userById as any).email;
              }
            } else {
              email = magicTokenData.email;
            }

            password = '123456'; // Use default password for magic link login
            isMagicLogin = true;
          }


          console.log('Email:', email);
          console.log('isJetzyMember:', isJetzyMember, `(raw: ${isJetzyMemberRaw})`);
          console.log('isMagicLogin:', isMagicLogin);

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

          // If user still not found and it's a magic token login, create the user
          if (!user && isMagicLogin && magicTokenData) {
            console.log('Creating JIT user from magic token:', email);
            const hashedPassword = await bcrypt.hash('123456', 10);
            user = await EventUsers.create({
              firstName: magicTokenData.firstName,
              lastName: magicTokenData.lastName,
              email: magicTokenData.email,
              password: hashedPassword,
              role: 'user',
              isVerified: true
            });
            // Fetch again to get the document with all fields and methods
            user = await EventUsers.findById(user._id).select('+password');
          }

          if (!user) {
            console.log('User not found in either collection');
            throw new Error("User was not found.");
          }

          // ── Account Safety Checks ─────────────────────────────────────────
          if ((user as any).emailBounced) {
            console.log('🔴 Login blocked: email bounced for', email);
            throw new Error("EMAIL_BOUNCED");
          }
          if ((user as any).isBlocked) {
            console.log('🔴 Login blocked: account blocked for', email);
            throw new Error("ACCOUNT_BLOCKED");
          }
          // ──────────────────────────────────────────────────────────────────

          const isPasswordCorrect = isMagicLogin || await bcrypt.compare(password, user.password);
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

          // Search other collections for image if missing in primary
          let finalImage = user.image;
          if ((!finalImage || finalImage === "") && email) {
            const alternativeUser = await Users.findOne({ email, image: { $exists: true, $ne: "" } }).select("image").lean() as any
              || await EventUsers.findOne({ email, image: { $exists: true, $ne: "" } }).select("image").lean() as any;
            if (alternativeUser?.image) {
              finalImage = alternativeUser.image;
            }
          }

          const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || ''
          const userData = {
            _id: user._id.toString(),
            id: user._id.toString(),
            name: displayName,
            fullName: displayName,
            email: user.email,
            role: user.role,
            accessToken: accessToken,
            isBlocked: !!(user as any).isBlocked,
            emailBounced: !!(user as any).emailBounced,
            requiresVerification: !!(user as any).requiresVerification,
            ...(finalImage ? { image: finalImage } : {}),
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
        photoUrl: { label: "Photo URL", type: "text" },
      },
      async authorize(credentials, req) {
        console.log("--- Firebase Auth API Start ---");
        try {
          const { idToken, name: nameFromFront, email: emailFromFront, image: imageFromFront, photoUrl: photoUrlFromFront } = credentials ?? {};
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
          const image = imageFromToken || imageFromFront || photoUrlFromFront || imageFromToken; // Fallback to multiple sources

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

          // ── Account Safety Checks ─────────────────────────────────────────
          if (user) {
            if ((user as any).emailBounced) {
              console.log('🔴 Social Login blocked: email bounced for', email);
              throw new Error("EMAIL_BOUNCED");
            }
            if ((user as any).isBlocked) {
              console.log('🔴 Social Login blocked: account blocked for', email);
              throw new Error("ACCOUNT_BLOCKED");
            }
          }
          // ──────────────────────────────────────────────────────────────────

          // If this is a signup attempt but the user already exists, throw error
          const { isSignup } = (credentials as any) ?? {};
          if (isSignup === "true" && user) {
            console.log(`🔴 Social Signup failed: User ${email} already exists.`);
            throw new Error("You are already a member! Please log in to your account.");
          }

          // If user doesn't exist, create a new one (Social Signup)
          if (!user) {
            console.log(`Firebase Auth: User ${email} not found, creating new account...`);
            const firstName = name?.split(" ")[0] || email?.split("@")[0] || "User";
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
          }

          // Use image from MongoDB first, search other collections if missing.
          // Fall back to social login image ONLY if no MongoDB image is found anywhere.
          let sessionImage = user.image;

          // Search other collections for image if missing
          if ((!sessionImage || sessionImage === "") && email) {
            const alternativeUser = await Users.findOne({ email, image: { $exists: true, $ne: "" } }).select("image").lean() as any
              || await EventUsers.findOne({ email, image: { $exists: true, $ne: "" } }).select("image").lean() as any;
            if (alternativeUser?.image) {
              sessionImage = alternativeUser.image;
            }
          }

          // Finally fall back to social image (session only)
          if (!sessionImage || sessionImage === "") {
            sessionImage = image;
          }

          console.log("--- Firebase Auth API Success ---");
          const firebaseDisplayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || ''
          return {
            _id: user._id.toString(),
            id: user._id.toString(),
            name: firebaseDisplayName,
            fullName: firebaseDisplayName,
            email: user.email,
            role: user.role,
            accessToken: accessToken, // Now using Jetzy SSO token
            ...(sessionImage ? { image: sessionImage } : {}),
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
