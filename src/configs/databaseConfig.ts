// Load the environment virables
import mongoose from "mongoose"

/**
 * Database configuration handler
 */
export const databaseConfig = async () => {
  try {
    return mongoose.connect(process.env.NEXT_PUBLIC_DB_URL as string)
  } catch (error) {
    console.error("Error connecting to the database: ", error)
  }
}
