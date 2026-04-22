
import { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { ReferralCodes } from "@/models/events/referral-codes"
import { BookingStatus } from "@/models/events/types"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { eventId, codeId } = req.query

    if (req.method !== "GET") {
        return res.status(405).json({ status: false, message: "Method not allowed" })
    }

    try {
        await ensureDbConnected()

        const referralCode = await ReferralCodes.findOne({
            _id: codeId,
            eventId: eventId
        })

        if (!referralCode) {
            return res.status(404).json({ status: false, message: "Referral code not found" })
        }

        // Aggregate stats
        const stats = await Bookings.aggregate([
            {
                $match: {
                    eventId: referralCode.eventId,
                    referralCode: referralCode.code,
                    status: {
                        $in: [BookingStatus.CONFIRMED, BookingStatus.APPROVED]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$total" },
                    verifiedUsageCount: { $sum: 1 }
                }
            }
        ])

        const result = stats.length > 0 ? stats[0] : { totalSales: 0, verifiedUsageCount: 0 }

        return res.status(200).json({
            status: true,
            data: {
                ...result,
                code: referralCode.code,
                commissionPercentage: referralCode.commissionPercentage || 10
            },
        })
    } catch (error: any) {
        console.error("Error fetching referral stats:", error)
        return res.status(500).json({ status: false, message: "Internal server error" })
    }
}
