# S3 File Upload Implementation Guide

This document explains how S3 file uploads are implemented in the events-jetzy-com app, so you can replicate the same pattern in the JetzyChat app.

## Overview

The app uses **AWS S3** for file storage, but the frontend doesn't interact with S3 directly. Instead, files are uploaded through a backend API endpoint that handles the S3 operations.

### Architecture Flow

```
Frontend (React/Next.js)
    ↓ (FormData POST request)
Backend API Endpoint
    ↓ (AWS SDK)
AWS S3 Bucket
    ↓ (returns URL)
Frontend receives S3 file URL
```

## S3 Configuration

- **Bucket Name**: `jetzy-media-prod`
- **Region**: `us-east-1`
- **Full S3 URL Pattern**: `https://jetzy-media-prod.s3.us-east-1.amazonaws.com/{path}`

## Frontend Implementation

### Current Implementation Status

**Important**: The current implementation:
- ✅ **Works without any environment variables**
- ✅ Uses a hardcoded API endpoint: `https://prod-api.jetzy.com/api/v1/uploader/multiple`
- ✅ No AWS credentials needed in frontend
- ✅ No configuration required

### 1. Upload Hook (`src/lib/edgestore.ts`)

The app uses a custom `useEdgeStore` hook that wraps the upload functionality. Here's the **actual current implementation**:

```typescript
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
            upload: async ({ 
                file, 
                onProgressChange, 
                options 
            }: { 
                file: File
                onProgressChange?: (progress: number) => void
                options?: any 
            }) => {
                const formData = new FormData()
                formData.append("upload_file", file)
                
                // Use folder from options if provided, otherwise default to "posts"
                // This allows different components to specify folder (e.g., "events", "comments", "replies")
                const folder = options?.folder || "posts"
                formData.append("folder", folder)

                try {
                    // Current implementation: API endpoint is hardcoded
                    // Optional improvement: Use process.env.NEXT_PUBLIC_UPLOAD_API_URL for configurability
                    const response = await axios.post(
                        "https://prod-api.jetzy.com/api/v1/uploader/multiple", 
                        formData, 
                        {
                            headers: {
                                "Content-Type": "multipart/form-data",
                            },
                            onUploadProgress: (progressEvent) => {
                                if (onProgressChange && progressEvent.total) {
                                    const progress = Math.round(
                                        (progressEvent.loaded * 100) / progressEvent.total
                                    )
                                    onProgressChange(progress)
                                }
                            },
                        }
                    )

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
```

### 2. Usage in Components

#### Basic Upload Example

```typescript
import { useEdgeStore } from "@/lib/edgestore"

const MyComponent = () => {
    const { edgestore } = useEdgeStore()
    const [uploadProgress, setUploadProgress] = useState(0)
    const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)

    const handleFileUpload = async (file: File) => {
        try {
            const res = await edgestore.publicFiles.upload({
                file,
                onProgressChange: (progress) => {
                    setUploadProgress(progress)
                },
                options: {
                    folder: "chat" // Optional: specify folder
                }
            })
            
            setUploadedUrl(res.url)
            console.log("File uploaded to:", res.url)
        } catch (error) {
            console.error("Upload failed:", error)
        }
    }

    return (
        <div>
            <input 
                type="file" 
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file)
                }} 
            />
            {uploadProgress > 0 && <div>Progress: {uploadProgress}%</div>}
            {uploadedUrl && <img src={uploadedUrl} alt="Uploaded" />}
        </div>
    )
}
```

#### Multiple Files Upload Example

```typescript
const handleMultipleFilesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const uploadedUrls: string[] = []

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            const res = await edgestore.publicFiles.upload({
                file,
                onProgressChange: (progress) => {
                    setUploadProgress(progress)
                },
            })
            uploadedUrls.push(res.url)
        }
        
        console.log("All files uploaded:", uploadedUrls)
    } catch (error) {
        console.error("Error uploading files", error)
    }
}
```

### 3. Next.js Configuration

Add your S3 bucket domain to `next.config.mjs` to allow Next.js Image component to load images from S3:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "jetzy-media-prod.s3.us-east-1.amazonaws.com",
                port: "",
                pathname: "/**",
            },
            // Add your S3 bucket here
            {
                protocol: "https",
                hostname: "your-bucket-name.s3.your-region.amazonaws.com",
                port: "",
                pathname: "/**",
            },
        ],
    },
}

export default nextConfig
```

## Backend API Requirements

The frontend expects a backend API endpoint that handles the actual S3 upload. Here's what the backend needs to implement:

### API Endpoint Specification

**Endpoint**: `POST /api/v1/uploader/multiple`

**Request**:
- Content-Type: `multipart/form-data`
- Form fields:
  - `upload_file`: The file to upload (File/Blob)
  - `folder`: Optional folder name for organization (default: "posts")

**Response Format**:
```json
{
  "data": [
    {
      "fileUrl": "https://bucket-name.s3.region.amazonaws.com/path/to/file.jpg"
    }
  ]
}
```

### Backend Implementation Example (Node.js/Express)

```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import multer from "multer"
import { v4 as uuidv4 } from "uuid"
import path from "path"

// Initialize S3 client
const s3Client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
})

const upload = multer({ storage: multer.memoryStorage() })

// Upload endpoint
app.post("/api/v1/uploader/multiple", upload.single("upload_file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file provided" })
        }

        const file = req.file
        const folder = req.body.folder || "posts"
        
        // Generate unique filename
        const fileExtension = path.extname(file.originalname)
        const fileName = `${folder}/${uuidv4()}${fileExtension}`
        
        // Upload to S3
        const command = new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME!,
            Key: fileName,
            Body: file.buffer,
            ContentType: file.mimetype,
            ACL: "public-read", // Make file publicly accessible
        })

        await s3Client.send(command)

        // Construct the public URL
        const fileUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`

        res.json({
            data: [
                {
                    fileUrl: fileUrl
                }
            ]
        })
    } catch (error) {
        console.error("Upload error:", error)
        res.status(500).json({ error: "Upload failed" })
    }
})
```

### Required Environment Variables

#### Frontend (Next.js App) - **NONE REQUIRED**

**Current Implementation:**
- ✅ **No environment variables needed** - The API endpoint is hardcoded in the upload hook
- ✅ The endpoint `https://prod-api.jetzy.com/api/v1/uploader/multiple` is directly used in the code

**Optional Improvement (Recommended for Flexibility):**

If you want to make the upload endpoint configurable, you can add:

```env
# Optional: Make the upload API endpoint configurable
NEXT_PUBLIC_UPLOAD_API_URL=https://your-api.com/api/v1/uploader/multiple
```

Then update the upload hook to use it:
```typescript
// In src/lib/edgestore.ts, replace the hardcoded URL with:
const uploadEndpoint = process.env.NEXT_PUBLIC_UPLOAD_API_URL || "https://prod-api.jetzy.com/api/v1/uploader/multiple"
const response = await axios.post(uploadEndpoint, formData, { ... })
```

**Note**: The current implementation works without any env vars - this is just an optional improvement for better configurability.

#### Backend (API Server) - Required

If you're building your own backend API to handle S3 uploads:

```env
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name
```

**Important**: 
- Frontend does NOT need AWS credentials
- AWS credentials should ONLY be in your backend/server environment
- Never expose AWS credentials in frontend code or client-side environment variables

### Required NPM Packages (Backend)

```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.294.0",
    "multer": "^1.4.5-lts.1",
    "uuid": "^9.0.0"
  }
}
```

## Features

### 1. Folder Organization
Files can be organized into folders by passing the `folder` option:
- `"posts"` - Default folder
- `"events"` - Event-related files
- `"comments"` - Comment attachments
- `"chat"` - Chat messages attachments
- `"replies"` - Reply attachments

### 2. Upload Progress Tracking
The hook supports progress tracking via the `onProgressChange` callback:
```typescript
edgestore.publicFiles.upload({
    file,
    onProgressChange: (progress) => {
        // progress is 0-100
        console.log(`Upload progress: ${progress}%`)
    }
})
```

### 3. Error Handling
The upload function throws errors that should be caught:
```typescript
try {
    const res = await edgestore.publicFiles.upload({ file })
} catch (error) {
    // Handle error (network, server, validation, etc.)
    console.error("Upload failed:", error)
}
```

## File Deletion

Currently, the delete function is a placeholder. To implement file deletion:

### Frontend (already implemented)
```typescript
await edgestore.publicFiles.delete({ url: fileUrl })
```

### Backend Implementation Needed
```typescript
import { DeleteObjectCommand } from "@aws-sdk/client-s3"

app.delete("/api/v1/uploader/delete", async (req, res) => {
    try {
        const { url } = req.body
        
        // Extract key from S3 URL
        const urlObj = new URL(url)
        const key = urlObj.pathname.substring(1) // Remove leading /
        
        const command = new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME!,
            Key: key,
        })
        
        await s3Client.send(command)
        
        res.json({ success: true })
    } catch (error) {
        console.error("Delete error:", error)
        res.status(500).json({ error: "Delete failed" })
    }
})
```

## Integration Steps for JetzyChat

1. **Create the upload hook** (`src/lib/edgestore.ts` or similar)
   - Copy the implementation from this document
   - **Option A**: Hardcode your API endpoint URL (simplest, no env vars needed)
   - **Option B**: Use `NEXT_PUBLIC_UPLOAD_API_URL` environment variable (more flexible)
   - Keep the same interface for consistency

2. **Set up environment variables** (`.env.local` or `.env`) - **OPTIONAL**
   ```env
   # Only if you chose Option B above
   NEXT_PUBLIC_UPLOAD_API_URL=https://your-backend-api.com/api/v1/uploader/multiple
   ```
   
   **Note**: If you hardcode the endpoint (Option A), you can skip this step entirely.

3. **Wrap your app with the provider** (if using context):
   ```typescript
   import { EdgeStoreProvider } from "@/lib/edgestore"
   
   function App({ children }) {
       return <EdgeStoreProvider>{children}</EdgeStoreProvider>
   }
   ```

4. **Configure Next.js** (`next.config.mjs`)
   - Add your S3 bucket domain to `images.remotePatterns`

5. **Implement backend API** (if building your own)
   - Create the upload endpoint
   - Set up AWS SDK with credentials
   - Handle file uploads to S3

6. **Use in components**
   - Import `useEdgeStore` hook
   - Call `edgestore.publicFiles.upload()` with file and options

## Notes

- **No environment variables needed** - The current implementation works without any env vars
- The actual S3 upload logic is handled by the backend API (`prod-api.jetzy.com`), not the frontend
- Frontend only sends files via FormData to the backend API endpoint
- Backend is responsible for AWS credentials and S3 operations
- Files are stored with public-read ACL for direct URL access
- Folder organization helps keep S3 bucket organized
- The API endpoint is hardcoded to `https://prod-api.jetzy.com/api/v1/uploader/multiple`

## Example Response from Backend

```json
{
  "data": [
    {
      "fileUrl": "https://jetzy-media-prod.s3.us-east-1.amazonaws.com/chat/abc123-def456-ghi789.jpg"
    }
  ]
}
```

The frontend expects this exact format to extract the `fileUrl`.

## Environment Variables Summary for JetzyChat

### Frontend (.env.local or .env)

**Current Implementation Status:**
- ✅ **NO environment variables required** - The API endpoint is hardcoded
- ✅ Works out of the box without any configuration

**Optional (Only if you want configurability):**
```env
# Make the upload API endpoint configurable (optional improvement)
NEXT_PUBLIC_UPLOAD_API_URL=https://your-backend-api.com/api/v1/uploader/multiple
```

**Important Notes:**
- ✅ Frontend does NOT need AWS credentials
- ✅ Frontend does NOT need S3 bucket name or region  
- ✅ Frontend does NOT need any env vars for the current implementation
- ✅ Only needs `NEXT_PUBLIC_UPLOAD_API_URL` if you want to make the endpoint configurable
- ❌ Never put AWS credentials in frontend environment variables

### Backend (.env)

**Required (if building your own backend):**
```env
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-s3-bucket-name
```

**Important Notes:**
- ✅ These should ONLY be in your backend/server environment
- ✅ Never commit these to version control
- ✅ Use environment-specific values (dev/staging/prod)
- ✅ If using an existing backend API, you may not need to set these (the backend team handles it)

