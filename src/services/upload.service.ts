import axios from "axios";

const UPLOAD_ENDPOINT = "https://prod-api.jetzy.com/api/v1/uploader/multiple";

/**
 * The folders the Jetzy uploader actually accepts.
 *
 * This list is enforced SERVER-SIDE and we cannot read it: anything outside it comes back as
 * `{"message":"Invalid Folder","status":false,"code":500}` - a hard 500 in front of whoever was
 * uploading. This field was `string`, so inventing a folder name compiled cleanly and failed only
 * in production. That is exactly how `"blasts"` shipped and broke blast attachments outright, and
 * how `"events"` sat silently breaking inline images in the description editor.
 *
 * Verified empirically against the live endpoint on 2026-10-07 - one upload per candidate, NOT
 * read from the backend source. `posts` and `photos` succeeded; `blasts`, `events` and
 * `attachments` were all refused. Adding one means PROBING for it first, never guessing.
 *
 * The legacy `src/lib/edgestore.ts` shim posts to the same endpoint and is under the same rule.
 */
export type UploadFolder = "posts" | "photos";

export const UPLOAD_FOLDERS: UploadFolder[] = ["posts", "photos"];

interface UploadOptions {
    folder?: UploadFolder;
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
