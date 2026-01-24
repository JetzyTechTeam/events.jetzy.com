import { createConnection, Connection } from "mongoose"

if (!process.env.NEXT_EVENTS_DB_URL) throw new Error("Add the NEXT_EVENTS_DB_URL environment variable inside .env.local to use MongoDB")

let dbconn: Connection

declare global {
    var mongooseConnection: Connection | undefined
}

if (process.env.NODE_ENV === "production") {
    dbconn = createConnection(process.env.NEXT_EVENTS_DB_URL, {
        autoIndex: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4,
    })
    // Ensure connection is established before proceeding
    dbconn.asPromise().catch((err) => {
        console.error("Failed to establish database connection in production:", err);
    });
} else {
    if (!global.mongooseConnection) {
        global.mongooseConnection = createConnection(process.env.NEXT_EVENTS_DB_URL, {
            autoIndex: false,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4,
        })
    }
    dbconn = global.mongooseConnection
}

dbconn.on('error', (err) => {
    console.error("Mongoose Connection Error:", err);
});

export { dbconn }
