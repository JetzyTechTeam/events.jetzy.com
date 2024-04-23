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
  if (!error?.status) {
    if (error?.data) {
      toast(
        () => (
          <div className="flex flex-col gap-4">
            <h1 className="font-bold text-md black w-full">{title}</h1>
            <div className="text-gray-600 p-2">
              <ul>
                {error?.data?.map((message: string) => (
                  <li key={uniqueId()} className="text-rose-400">
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ),
        { type: "error" }
      )
    } else {
      toast(
        () => (
          <div className="flex flex-col gap-4">
            <h1 className="font-bold text-md black w-full">{title}</h1>
            <p className="text-gray-600 p-2">{error?.message}</p>
          </div>
        ),
        { type: "error" }
      )
    }
  } else {
    toast(
      () => (
        <div className="flex flex-col gap-4">
          <h1 className="font-bold text-md black w-full">{title}</h1>
          <p className="text-gray-600 p-2">{error?.message ?? error}</p>
        </div>
      ),
      { type: "error" }
    )
  }
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
