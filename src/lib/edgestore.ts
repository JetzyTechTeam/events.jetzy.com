"use client"

import React from "react"
import axios from "axios"

const EdgeStoreContext = React.createContext<any>(null)

const EdgeStoreProvider = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(EdgeStoreContext.Provider, { value: {} }, children)
}

const useEdgeStore = () => {
    const edgestore = {
        publicFiles: {
            upload: async ({ file, onProgressChange, signal, options }: { file: File; onProgressChange?: (progress: number) => void; signal?: AbortSignal; options?: any }) => {
                const formData = new FormData()
                formData.append("upload_file", file)
                // Use folder from options if provided, otherwise default to "posts"
                // This allows different components to specify folder (e.g., "events", "comments", "replies")
                const folder = options?.folder || "posts"
                formData.append("folder", folder)

                try {
                    const response = await axios.post("https://prod-api.jetzy.com/api/v1/uploader/multiple", formData, {
                        headers: {
                            "Content-Type": "multipart/form-data",
                        },
                        signal,
                        onUploadProgress: (progressEvent) => {
                            if (onProgressChange && progressEvent.total) {
                                const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                                onProgressChange(progress)
                            }
                        },
                    })

                    if (response.data?.data?.[0]?.fileUrl) {
                        return { url: response.data.data[0].fileUrl }
                    }
                    throw new Error("Invalid response from upload server")
                } catch (error) {
                    console.error("Upload failed:", error)
                    throw error
                }
            },
            delete: async ({ url }: { url: string }) => {
                console.log("Delete requested for:", url)
                // API does not support delete yet, just logging
                return Promise.resolve()
            },
        },
    }

    return { edgestore }
}

export { EdgeStoreProvider, useEdgeStore }
