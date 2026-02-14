import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim(),
};

// Diagnostic logs for client-side Firebase
if (typeof window !== "undefined") {
    console.log("Firebase Client: Initializing with Project ID:", firebaseConfig.projectId);
    console.log("Firebase Client: API Key length:", firebaseConfig.apiKey?.length || 0);
    if (!firebaseConfig.apiKey) {
        console.error("❌ Firebase Client: apiKey is missing from config!");
    } else if (firebaseConfig.apiKey.includes("\"") || firebaseConfig.apiKey.includes("'")) {
        console.warn("⚠️ Firebase Client: apiKey contains quotes, this might cause issues!");
    }
} else {
    // Server-side logs
    console.log("--- Firebase Client Init (Server Side) ---");
    console.log("Project ID:", firebaseConfig.projectId);
    console.log("API Key present:", !!firebaseConfig.apiKey);
}

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };
