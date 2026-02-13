import { ensureDbConnected } from "../src/configs/database"
import { DiscussionPosts } from "../src/models/events/discussion-posts"
import mongoose from "mongoose"

async function checkRecentPosts() {
    console.log("Connecting to DB...")
    await ensureDbConnected()
    console.log("Connected.")

    const recentPosts = await DiscussionPosts.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()

    console.log("Recent 5 posts:")
    console.log(JSON.stringify(recentPosts, null, 2))

    await mongoose.connection.close()
}

checkRecentPosts().catch(console.error)
