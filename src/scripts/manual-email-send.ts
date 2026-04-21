

import sgMail from "@sendgrid/mail";
import fs from "fs";
import path from "path";

// Helper to load env vars
function loadEnv(filePath: string) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    content.split("\n").forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.log(`Loaded env from ${filePath}`);
  }
}

// Load envs
loadEnv(path.join(process.cwd(), ".env.local"));
loadEnv(path.join(process.cwd(), ".env"));

// Hardcoded details
const EVENT_NAME = "New Year's Eve Get Together";
const VENUE = "Bar Sella, Hyatt Union Square, 134 4th Ave, New York, NY 10003.";
const TIME = "7pm to 3am";
const NOTE = "Your ticket covers the entrance fee. You will be able to purchase food and drinks from the venue";
const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";

const TEST_EMAILS = [
  "shama@jetzyapp.com",
  "mshemonsky@aol.com",
  "natalia.stone.photography@gmail.com",
  "ellentaohuang@yahoo.com",
  "lizbethxq@gmail.com",
  "scottomj@gmail.com",
  "shanev@gmail.com",
  "Udayasus96526@gmail.com",
  "sherecemiller@gmail.com"
];

// Ensure API key is present
if (!process.env.SENDGRID_API_KEY) {
  console.error("SENDGRID_API_KEY is missing!");
  process.exit(1);
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY?.trim());

const emailHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #333; text-align: center;">Update: Event Details for ${EVENT_NAME}</h1>
  
  <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h2 style="color: #333; margin-bottom: 15px;">Event Information</h2>
    <p><strong>Event:</strong> ${EVENT_NAME}</p>
    <p><strong>Time:</strong> ${TIME}</p>
    <p><strong>Venue:</strong> ${VENUE}</p>
  </div>

  <div style="background-color: #FFF5EB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F79432;">
    <p style="color: #1C1E21; margin: 0; font-weight: bold;">
      ${NOTE}
    </p>
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
    <div style="display: inline-block; vertical-align: middle;">
      <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Download_on_the_App_Store_Badge.svg/320px-Download_on_the_App_Store_Badge.svg.png" alt="Download on the App Store" style="height: 40px; width: auto;" />
      </a>
      <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/320px-Google_Play_Store_badge_EN.svg.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
      </a>
    </div>
  </div>

  <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
    <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
      Questions? Contact us at <a href="mailto:marketing@jetzy.com" style="color: #1877F2; text-decoration: none;">marketing@jetzy.com</a>
    </p>
    <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
      &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
    </p>
  </div>
</div>
`;

async function sendEmail() {
  console.log("Sending manual emails...");

  for (const email of TEST_EMAILS) {
    try {
      await sgMail.send({
        to: email,
        from: process.env.SENDGRID_EMAIL_SENDER?.trim() || "tech@jetzyapp.com", // Fallback sender
        subject: `Important Update: ${EVENT_NAME}`,
        html: emailHtml,
      });
      console.log(`✅ Email sent to ${email}`);
    } catch (error: any) {
      console.error(`❌ Failed to send to ${email}:`, error.message);
      if (error.response) {
        console.error(JSON.stringify(error.response.body, null, 2));
      }
    }
  }
}

sendEmail();
