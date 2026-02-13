import * as admin from "firebase-admin";

if (!admin.apps.length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
        console.error("❌ Firebase Admin missing required environment variables:");
        if (!projectId) console.error("   - NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing");
        if (!clientEmail) console.error("   - FIREBASE_CLIENT_EMAIL is missing");
        if (!privateKey) console.error("   - FIREBASE_PRIVATE_KEY is missing");
        console.error("Firebase Admin will NOT be initialized. Social login will fail.");
    } else {
        try {
            console.log("Firebase Admin: Attempting to initialize with Project ID:", projectId);
            admin.initializeApp({
                credential: admin.credential.cert({
                    project_id: projectId,
                    client_email: clientEmail,
                    private_key: privateKey.replace(/\\n/g, "\n"),
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
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        return decodedToken;
    } catch (error) {
        console.error("Error verifying ID token:", error);
        throw error;
    }
};
