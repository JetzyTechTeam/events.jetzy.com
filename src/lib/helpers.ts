import type { NextApiRequest, NextApiResponse } from "next"

/**
  @todo Send response to the client
*/
export const sendResponse = (res: NextApiResponse, resData?: any, msg?: string, state: boolean = false, statusCode = 200) => {
  return res.status(statusCode).json({
    // response message
    message: msg,
    // Operation status
    status: state,
    // status code
    code: statusCode,
    // Response data
    data: resData,
  })
}

export function generateRandomId(length: number, useIntegers: boolean = false): string | number {
  const characters = useIntegers ? "0123456789" : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  const charactersLength = characters.length
  let randomId = ""

  for (let i = 0; i < length; i++) {
    randomId += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return randomId
}

export function getExpirationDate(durationInHours: number, durationInMinutes: number): Date {
  // Convert hours and minutes to milliseconds
  const hoursInMilliseconds = durationInHours * 60 * 60 * 1000
  const minutesInMilliseconds = durationInMinutes * 60 * 1000

  // Calculate future date
  const futureDate = new Date(Date.now() + hoursInMilliseconds + minutesInMilliseconds)

  return futureDate
}
