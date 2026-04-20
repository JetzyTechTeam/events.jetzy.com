import { toast } from "react-toastify"
import { uniqueId } from "./utils"

export const Success = (title?: string, message?: string) => {
  toast(
    () => (
      <div className="flex flex-col gap-4">
        <h1 className="font-bold text-md black w-full">{title}</h1>
        <p className="text-gray-600 p-2">{message}</p>
      </div>
    ),
    { type: "success" }
  )
}

export const Error = (title?: string, message?: string) => {
  toast(
    () => (
      <div className="flex flex-col gap-4">
        <h1 className="font-bold text-md black w-full">{title}</h1>
        <p className="text-gray-600 p-2">{message}</p>
      </div>
    ),
    { type: "error" }
  )
}

export const ServerErrors = (title?: string, error?: any) => {
  // Extract the most useful message from various error shapes
  const extractMessage = (err: any): string => {
    if (!err) return "Something went wrong. Please try again."
    if (typeof err === "string") return err
    // Server response shape: { status, message, data }
    if (err?.message && err.message !== "Rejected") return err.message
    // Zod errors array
    if (Array.isArray(err?.data) && err.data.length > 0) {
      return err.data.map((e: any) => e?.message || JSON.stringify(e)).join(", ")
    }
    if (Array.isArray(err) && err.length > 0) {
      return err.map((e: any) => e?.message || JSON.stringify(e)).join(", ")
    }
    return "Something went wrong. Please try again."
  }

  const message = extractMessage(error)
  const hasDetailList = Array.isArray(error?.data) && error.data.length > 0

  toast(
    () => (
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-md text-black w-full">{title}</h1>
        {hasDetailList ? (
          <ul className="text-gray-600 p-2 list-disc pl-4">
            {error.data.map((e: any, i: number) => (
              <li key={i} className="text-rose-500 text-sm">
                {e?.message || JSON.stringify(e)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600 p-2 text-sm">{message}</p>
        )}
      </div>
    ),
    { type: "error" }
  )
}

export const Info = (title?: string, message?: string) => {
  toast(
    () => (
      <div className="flex flex-col gap-4">
        <h1 className="font-bold text-md black w-full">{title}</h1>
        <p className="text-gray-600 p-2">{message}</p>
      </div>
    ),
    { type: "info" }
  )
}

export const Warning = (title?: string, message?: string) => {
  toast(
    () => (
      <div className="flex flex-col gap-4">
        <h1 className="font-bold text-md black w-full">{title}</h1>
        <p className="text-gray-600 p-2">{message}</p>
      </div>
    ),
    { type: "warning" }
  )
}
