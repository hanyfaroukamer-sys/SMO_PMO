import { useState } from "react";
import { useRequestUploadUrl } from "@workspace/api-client-react";

export function useUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const requestUrlMutation = useRequestUploadUrl();

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setProgress(10);
    
    try {
      // 1. Get presigned URL
      const { uploadURL, objectPath } = await requestUrlMutation.mutateAsync({
        data: {
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }
      });
      
      setProgress(40);

      // 2. Upload directly to GCS via the presigned URL
      const response = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to upload file to storage");
      }

      setProgress(100);
      return { objectPath, fileName: file.name, contentType: file.type };
    } catch (error) {
      console.error("Upload failed:", error);
      throw error;
    } finally {
      setIsUploading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  return { uploadFile, isUploading, progress };
}
