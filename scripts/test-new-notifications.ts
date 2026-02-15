import * as dotenv from "dotenv";
dotenv.config();

import {
    sendDiscussionNotification,
    sendCommentNotification,
    sendTagNotification
} from "../src/lib/send-grid";

const run = async () => {
    const testEmail = process.argv[2] || "raoarsalanlatif@gmail.com";
    const firstName = "Arsalan";
    const lastName = "Rao";
    const eventName = "Jetzy Tech Meetup";
    const eventSlug = "jetzy-tech-meetup";
    const magicToken = "mock-magic-token-123";
    const postId = "mock-post-id-456";

    console.log(`Preparing to send sample notifications to: ${testEmail}...`);

    try {
        console.log("1. Sending Sample Post Notification...");
        await sendDiscussionNotification({
            email: testEmail,
            firstName,
            lastName,
            authorName: "John Doe",
            eventName,
            eventSlug,
            magicToken,
            postId
        });
        console.log("Post Notification sent!");

        console.log("2. Sending Sample Comment Notification...");
        await sendCommentNotification({
            email: testEmail,
            firstName,
            lastName,
            commenterName: "Jane Smith",
            eventName,
            eventSlug,
            magicToken,
            postId
        });
        console.log("Comment Notification sent!");

        console.log("3. Sending Sample Tag Notification...");
        await sendTagNotification({
            email: testEmail,
            firstName,
            lastName,
            authorName: "Alex Johnson",
            eventName,
            eventSlug,
            magicToken,
            postId
        });
        console.log("Tag Notification sent!");

        console.log("\nAll sample notifications sent successfully!");
    } catch (error) {
        console.error("Error sending sample notifications:", error);
    }
};

run();
