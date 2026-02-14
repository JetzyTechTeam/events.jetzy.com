import * as admin from "firebase-admin";

if (!admin.apps.length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

    if (!projectId || !clientEmail || !privateKey) {
        console.error("❌ Firebase Admin missing required environment variables:");
        if (!projectId) console.error("   - NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing");
        if (!clientEmail) console.error("   - FIREBASE_CLIENT_EMAIL is missing");
        if (!privateKey) console.error("   - FIREBASE_PRIVATE_KEY is missing");
        console.error("Firebase Admin will NOT be initialized. Social login will fail.");
    } else {
        try {
            console.log("Firebase Admin: Attempting to initialize with Project ID:", projectId);

            // Robust private key parsing
            let formattedKey = privateKey;
            if (formattedKey.includes("\\n")) {
                formattedKey = formattedKey.replace(/\\n/g, "\n");
            }

            // Trim any quotes that might have been accidentally included
            formattedKey = formattedKey.replace(/^"|"$/g, '');

            admin.initializeApp({
                credential: admin.credential.cert({
                    project_id: projectId,
                    client_email: clientEmail,
                    private_key: formattedKey,
                } as any),
            });
            console.log("✅ Firebase Admin initialized successfully");
        } catch (error: any) {
            console.error("❌ Firebase Admin initialization error:", error.message);
        }
    }
}

export const verifyIdToken = async (idToken: string) => {
    try {
        if (!admin.apps.length) {
            console.warn("⚠️ Firebase Admin is not initialized. Skipping idToken verification.");
            return null;
        }
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        return decodedToken;
    } catch (error) {
        console.error("Error verifying ID token:", error);
        throw error;
    }
};
