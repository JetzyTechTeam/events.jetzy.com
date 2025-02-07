import { MongoClient, Db } from "mongodb";

let cachedDb: Db | null = null;

const connectMongo = async (): Promise<Db> => {
  if (!process.env.NEXT_PUBLIC_DB_URL) {
    throw new Error(
      "Add the NEXT_PUBLIC_DB_URL environment variable inside .env.local to use MongoDB"
    );
  }

  if (cachedDb) return cachedDb;

  const client = new MongoClient(process.env.NEXT_PUBLIC_DB_URL);

  try {
    await client.connect();
    console.log("Connected successfully to MongoDB");

    const db = client.db(); 
    cachedDb = db; // Cache the database instance for reuse
    return db;
  } catch (e: any) {
    console.error("MongoDB Client Error: " + e.message);
    throw new Error("Failed to connect to MongoDB");
  }
};

export default connectMongo;
