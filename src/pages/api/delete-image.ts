import connectMongo from "@/lib/connect-db";
import { Events } from "@/models/events";
import { NextApiRequest, NextApiResponse } from "next";
import { NextResponse } from "next/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { url } = req.body;
    
    const result = await Events.updateOne(
      { images: { $in: [url] } },
      { $pull: { images: url } }
    );

    return res.status(200).json({ success: result.modifiedCount > 0 });
  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({ success: false });
  }
}
