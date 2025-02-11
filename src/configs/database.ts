"use server"
import { createConnection } from "mongoose"

if (!process.env.NEXT_EVENTS_DB_URL) throw new Error("Add the NEXT_EVENTS_DB_URL environment variable inside .env.local to use MongoDB")

export const dbconn = createConnection(process.env.NEXT_EVENTS_DB_URL)
