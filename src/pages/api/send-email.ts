import { NextApiRequest, NextApiResponse } from "next";
import { sendTicketConfirmation } from "@Jetzy/lib/send-grid";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { firstName, lastName, email, phone, tickets, orderNumber } = req.body;
    await sendTicketConfirmation({
      firstName,
      lastName,
      email,
      phone,
      tickets,
      orderNumber,
    });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Email sending error:', error);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
}