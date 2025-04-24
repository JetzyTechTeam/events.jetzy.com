import { Bookings } from '@/models/events/bookings'
import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }
  
const { eventId } = req.body

if (!eventId) {
  return res.status(400).json({ message: 'Event ID is required' })
}

  try {
		const bookings = await Bookings.find({ eventId: eventId })
    

    return res.status(200).json(bookings)
  } catch (error) {
    console.error('Error fetching bookings:', error)
    return res.status(500).json({ message: 'Error fetching bookings' })
  }
}
