import { createConnection, Connection } from "mongoose"
import * as dotenv from "dotenv"

// Load environment variables
dotenv.config()

/**
 * Production database configuration
 * This connects directly to the production MongoDB instance
 */

const PROD_DB_URL = process.env.PROD_DB_URL || "mongodb+srv://jetzy-prod-user:098hyG7Xb26YzVo4@prod-jetzy-cluster.mvkbz.mongodb.net/main"
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SENDGRID_EMAIL_SENDER = process.env.SENDGRID_EMAIL_SENDER || "events@jetzyapp.com"
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key"
const NEXT_PUBLIC_URL = process.env.NEXT_PUBLIC_URL || "https://events.jetzyapp.com"

export interface ProdConfig {
  dbUrl: string
  sendgridApiKey: string
  sendgridSender: string
  jwtSecret: string
  baseUrl: string
}

/**
 * Validate that all required configuration is present
 */
export function validateConfig(): void {
  console.log("[Config] Checking environment variables...")
  console.log(`  - SENDGRID_API_KEY: ${SENDGRID_API_KEY ? '✓ Set (length: ' + SENDGRID_API_KEY.length + ')' : '✗ NOT SET'}`)
  console.log(`  - SENDGRID_EMAIL_SENDER: ${SENDGRID_EMAIL_SENDER}`)
  console.log(`  - NEXT_PUBLIC_URL: ${NEXT_PUBLIC_URL}`)
  console.log(`  - JWT_SECRET: ${JWT_SECRET ? '✓ Set' : '✗ Using default'}`)
  console.log("")
  
  if (!SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY environment variable is required. Please set it in your .env or .env.local file.")
  }
}

/**
 * Get production configuration
 */
export function getProdConfig(): ProdConfig {
  return {
    dbUrl: PROD_DB_URL,
    sendgridApiKey: SENDGRID_API_KEY!,
    sendgridSender: SENDGRID_EMAIL_SENDER,
    jwtSecret: JWT_SECRET,
    baseUrl: NEXT_PUBLIC_URL,
  }
}

/**
 * Create a connection to production database
 */
export function createProdDbConnection(): Connection {
  console.log("[ProdDB] Connecting to production database...")
  
  const connection = createConnection(PROD_DB_URL, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 2,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    retryReads: true,
  })

  connection.on("connected", () => {
    console.log("[ProdDB] ✓ Production MongoDB connected successfully")
  })

  connection.on("error", (err) => {
    console.error("[ProdDB] ✗ MongoDB connection error:", err)
  })

  connection.on("disconnected", () => {
    console.log("[ProdDB] MongoDB disconnected")
  })

  return connection
}

/**
 * Close database connection gracefully
 */
export async function closeProdDbConnection(connection: Connection): Promise<void> {
  try {
    await connection.close()
    console.log("[ProdDB] ✓ Database connection closed")
  } catch (error) {
    console.error("[ProdDB] ✗ Error closing database connection:", error)
  }
}

