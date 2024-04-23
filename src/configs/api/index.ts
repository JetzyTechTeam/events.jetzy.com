import axios from "axios"

const BaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

const HTTPClient = axios.create({
  responseType: "json",
})

// request interceptors
HTTPClient.interceptors.request.use((configs: any) => {
  // check if authorization token is in session

  if (!configs?.url?.includes("csrf-cookie")) {
    configs.baseURL = `${BaseUrl}`
  } else {
    configs.baseURL = BaseUrl
  }

  const url = configs?.url?.split(":")
  if (url) {
    /* only add authorization header when access level for that 
		resource is protected */
    const isProtected = url[0]
    const path = url[1]

    if (isProtected === "protected") {
      if (typeof window !== "undefined") {
        if ("sessionStorage" in window) {
          if (sessionStorage?.getItem("api_token")) {
            if (typeof configs?.headers !== "undefined") {
              configs.headers.Authorization = `Bearer ${sessionStorage?.getItem("api_token")}`
            }
          }
        }
      }
    }

    // Rewrite the api base endpoint for third party services
    if (isProtected === "thirdparty") {
      configs.baseURL = "https:"
    }

    // Rewrite the api base endpoint for session base request
    if (isProtected === "session") {
      // get the nextAuth url
      configs.baseURL = process.env.NEXTAUTH_URL
    }

    // Rewrite the api base endpoint for openai services
    if (isProtected === "openai") {
      if (typeof configs?.headers != "undefined") {
        configs.headers.Authorization = `Bearer ${process.env.NEXT_PUBLIC_OPENAI_KEY}`
      }

      configs.baseURL = process.env.NEXT_PUBLIC_OPENAI_ENDPOINT
    }

    //  Set the request header
    const testPath = path?.toString()
    if (testPath.includes("uploader")) {
      if (typeof configs?.headers != "undefined") {
        configs.headers["Content-Type"] = "multipart/form-data"
      }
    } else {
      if (typeof configs?.headers != "undefined") {
        configs.headers["Content-Type"] = "application/x-www-form-urlencoded"
      }
    }
    if (path) configs.url = path

    return configs
  }
})

/* response interceptors */
HTTPClient.interceptors.response.use(
  (response) => {
    return Promise.resolve(response?.data)
  },
  (error) => {
    return Promise.reject(error?.response?.data)
  }
)

export const http_client = HTTPClient
/* export  */
const { get: GET, post: POST, put: PUT, delete: DROP } = HTTPClient
export { GET, POST, PUT, DROP }
