import { createConnection, Connection } from "mongoose"

const dbUrl = process.env.NEXT_EVENTS_DB_URL
if (!dbUrl) {
    console.warn("⚠️ NEXT_EVENTS_DB_URL is missing! This will cause database connection failures.")
}

let dbconn: Connection
let connectionPromise: Promise<Connection> | null = null

declare global {
    var mongooseConnection: Connection | undefined
    var mongooseConnectionPromise: Promise<Connection> | undefined
}

// Create connection with proper async handling
const safeDbUrl = dbUrl || "mongodb://localhost:27017/missing-db-url"

if (process.env.NODE_ENV === "production") {
    dbconn = createConnection(safeDbUrl, {
        autoIndex: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000, // Increased to 10s
        socketTimeoutMS: 45000,
        // family: 4,
        bufferCommands: false, // Disable buffering to get immediate errors
    })

    // Store the connection promise for awaiting
    connectionPromise = dbconn.asPromise().catch((err) => {
        console.error("Failed to establish database connection in production:", err);
        throw err;
    });

    dbconn.on('connected', () => {
        console.log('✅ MongoDB connected successfully in production');
    });

    dbconn.on('error', (err) => {
        console.error("❌ Mongoose Connection Error:", err);
    });

    dbconn.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected');
    });
} else {
    if (!global.mongooseConnection) {
        global.mongooseConnection = createConnection(safeDbUrl, {
            autoIndex: false,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            // family: 4,
            bufferCommands: false,
        })

        global.mongooseConnectionPromise = global.mongooseConnection.asPromise();
    }
    dbconn = global.mongooseConnection
    connectionPromise = global.mongooseConnectionPromise || null
}

// Helper function to ensure connection is ready
export async function ensureDbConnected(): Promise<Connection> {
    if (connectionPromise) {
        await connectionPromise;
    }

    // Double-check connection state
    if (dbconn.readyState !== 1) {
        console.log('Connection not ready, waiting...');
        await dbconn.asPromise();
    }

    return dbconn;
}

export { dbconn }
