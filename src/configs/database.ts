import { createConnection, Connection, ConnectOptions } from "mongoose"

const dbUrl = process.env.NEXT_EVENTS_DB_URL
if (!dbUrl) {
    console.warn("⚠️ NEXT_EVENTS_DB_URL is missing! This will cause database connection failures.")
}

const safeDbUrl = dbUrl || "mongodb://localhost:27017/missing-db-url"

// Buffering is ON (mongoose's default) deliberately. On a cold serverless container a query can
// legitimately be issued before the handshake finishes; with `bufferCommands: false` mongoose
// throws "Cannot call `events.findOne()` before initial connection is complete" instead of
// waiting — a race, not a fault. Buffered operations are queued on the connection and flushed by
// `onOpen()`. `bufferTimeoutMS` is held at the same order as `serverSelectionTimeoutMS` so a
// genuinely unreachable database still errors inside the function timeout rather than hanging to
// a gateway 504. The per-route `ensureDbConnected()` guard stays: buffering covers the gap, the
// guard is what bounds latency and surfaces a dead database cleanly.
// `bufferTimeoutMS` is read at runtime (driver `connection.js` -> `this.config.bufferTimeoutMS`)
// but is missing from mongoose's `ConnectOptions` type, hence the intersection.
const CONNECT_OPTIONS: ConnectOptions & { bufferTimeoutMS?: number } = {
    autoIndex: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    bufferCommands: true,
    bufferTimeoutMS: 10000,
}

declare global {
    var mongooseConnection: Connection | undefined
    var mongooseConnectionPromise: Promise<Connection> | null | undefined
}

// Cache the in-flight connect attempt so concurrent requests share one handshake, and DROP it on
// failure so the next request retries instead of awaiting a promise that is already, permanently,
// rejected.
function trackConnectAttempt(promise: Promise<Connection>): Promise<Connection> {
    global.mongooseConnectionPromise = promise
    promise.catch(() => {
        if (global.mongooseConnectionPromise === promise) {
            global.mongooseConnectionPromise = null
        }
    })
    return promise
}

// One connection per process, cached on `globalThis` in every environment — a module evaluated
// twice in one process (dev HMR, or two bundles sharing a lambda) must not open a second pool.
// Models bind to this object at import time (`dbconn.models["Events"] || dbconn.model(...)`), so
// it can never be replaced: a failed connect is retried by re-opening THIS connection, never by
// creating another one.
if (!global.mongooseConnection) {
    const conn = createConnection(safeDbUrl, CONNECT_OPTIONS)

    // Registered before the promise is taken: mongoose attaches its own no-op catch to
    // `$initialConnection` as soon as an `error` listener exists, so a failed first connect can
    // never surface as an unhandled rejection.
    conn.on("connected", () => {
        console.log("✅ MongoDB connected")
    })

    conn.on("error", (err) => {
        console.error("❌ Mongoose Connection Error:", err)
    })

    conn.on("disconnected", () => {
        console.warn("⚠️ MongoDB disconnected")
    })

    global.mongooseConnection = conn
    trackConnectAttempt(conn.asPromise())
}

const dbconn: Connection = global.mongooseConnection

// Helper function to ensure connection is ready
export async function ensureDbConnected(): Promise<Connection> {
    if (dbconn.readyState === 1) return dbconn

    const pending = global.mongooseConnectionPromise
    if (pending) {
        try {
            await pending
            return dbconn
        } catch {
            // Fall through and re-open below.
        }
    }

    // `asPromise()` resolves `$initialConnection`, which is a ONE-SHOT promise: once the first
    // attempt has failed it stays rejected for the life of the process, so awaiting it again
    // would poison every later request on this container. Re-opening the same connection is the
    // only way to retry without orphaning every compiled model.
    await trackConnectAttempt(dbconn.openUri(safeDbUrl, CONNECT_OPTIONS).then(() => dbconn))
    return dbconn
}

export { dbconn }
