import axios from "axios";

const UPLOAD_ENDPOINT = "https://prod-api.jetzy.com/api/v1/uploader/multiple";

interface UploadOptions {
    folder?: string;
    onProgressChange?: (progress: number) => void;
    // Optional AbortSignal so callers can cancel an in-flight upload.
    signal?: AbortSignal;
}

export const uploadFile = async (
    file: File,
    options?: UploadOptions
): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append("upload_file", file);
    // Default to "posts" if no folder is provided
    formData.append("folder", options?.folder || "posts");

    try {
        const response = await axios.post(UPLOAD_ENDPOINT, formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
            signal: options?.signal,
            onUploadProgress: (progressEvent) => {
                if (options?.onProgressChange && progressEvent.total) {
                    const progress = Math.round(
                        (progressEvent.loaded * 100) / progressEvent.total
                    );
                    options.onProgressChange(progress);
                }
            },
        });

        if (response.data?.data?.[0]?.fileUrl) {
            return { url: response.data.data[0].fileUrl };
        }

        throw new Error("Invalid response from upload server");
    } catch (error) {
        console.error("Upload failed:", error);
        throw error;
    }
};

export const deleteFile = async (url: string): Promise<void> => {
    // Since the previous implementation didn't actually delete from the server via EdgeStore (wrapper),
    // we will duplicate the behavior or rely on the api/delete-image if that was doing the heavy lifting.
    // The consumer seems to call /api/delete-image separately.
    // We can just keep this a no-op or implement a real delete if there is an endpoint.
    // For now, logging as per previous implementation behavior in the wrapper.
    console.log("Delete requested for:", url);
    return Promise.resolve();
};
