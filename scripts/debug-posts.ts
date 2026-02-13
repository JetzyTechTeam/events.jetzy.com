import mongoose, { Schema } from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const dbUrl = process.env.NEXT_EVENTS_DB_URL || process.env.NEXT_PUBLIC_DB_URL;

if (!dbUrl) {
    console.error("DB URL not found in env");
    process.exit(1);
}

const discussionPostSchema = new Schema(
    {
        title: String,
        content: String,
        images: [String],
        userId: Schema.Types.ObjectId,
    },
    { strict: false }
);

const DiscussionPosts = mongoose.model("DiscussionPosts", discussionPostSchema, "discussion-posts");

async function check() {
    console.log("Connecting to:", dbUrl);
    await mongoose.connect(dbUrl as string);
    console.log("Connected.");

    const posts = await DiscussionPosts.find({}).sort({ _id: -1 }).limit(5).lean();
    console.log("Recent posts:");
    console.log(JSON.stringify(posts, null, 2));

    await mongoose.disconnect();
}

check().catch(console.error);
