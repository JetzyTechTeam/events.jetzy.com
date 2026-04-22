import { Box, Button, Flex, Spinner, Text } from "@chakra-ui/react";
import React from "react";

interface MediaUploadSectionProps {
  uploadedImages: { file: string; id: string }[];
  uploadedVideos: { file: string; id: string }[];
  onImageChange: (files: FileList | null) => void;
  onVideoChange: (files: FileList | null) => void;
  isUploadingImage: boolean;
  isUploadingVideo: boolean;
  imageUploadProgress: number;
  videoUploadProgress: number;
  handleImageDelete: (file: string) => void;
  handleVideoDelete: (file: string) => void;
}

const MediaUploadSection: React.FC<MediaUploadSectionProps> = ({
  uploadedImages,
  uploadedVideos,
  onImageChange,
  onVideoChange,
  isUploadingImage,
  isUploadingVideo,
  imageUploadProgress,
  videoUploadProgress,
  handleImageDelete,
  handleVideoDelete,
}) => {
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const videoInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <Box>
      {/* Upload buttons row — always at top */}
      <Flex gap={3} align="center" mb={3}>
        {/* Image upload button */}
        <Box
          as="button"
          type="button"
          onClick={() => !isUploadingImage && imageInputRef.current?.click()}
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={1}
          bg="#2B2B2B"
          borderRadius="xl"
          px={5}
          py={3}
          cursor={isUploadingImage ? "not-allowed" : "pointer"}
          _hover={{ bg: isUploadingImage ? "#2B2B2B" : "#3A3A3A" }}
          border="1px dashed"
          borderColor="#444"
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            multiple
            ref={imageInputRef}
            style={{ display: "none" }}
            onChange={(e) => { onImageChange(e.target.files); e.target.value = ""; }}
          />
          {isUploadingImage ? (
            <Flex direction="column" align="center" gap={1}>
              <Spinner size="sm" color="#F79432" />
              <Text fontSize="xs" color="gray.400">{Math.round(imageUploadProgress)}%</Text>
            </Flex>
          ) : (
            <>
              <svg width="22" height="22" fill="none" stroke="#9CA3AF" strokeWidth="1.8" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
              </svg>
              <Text fontSize="xs" color="gray.400">Add Image</Text>
            </>
          )}
        </Box>

        {/* Video upload button */}
        <Box
          as="button"
          type="button"
          onClick={() => !isUploadingVideo && videoInputRef.current?.click()}
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={1}
          bg="#2B2B2B"
          borderRadius="xl"
          px={5}
          py={3}
          cursor={isUploadingVideo ? "not-allowed" : "pointer"}
          _hover={{ bg: isUploadingVideo ? "#2B2B2B" : "#3A3A3A" }}
          border="1px dashed"
          borderColor="#444"
        >
          <input
            type="file"
            accept="video/*"
            multiple
            ref={videoInputRef}
            style={{ display: "none" }}
            onChange={(e) => { onVideoChange(e.target.files); e.target.value = ""; }}
          />
          {isUploadingVideo ? (
            <Flex direction="column" align="center" gap={1}>
              <Spinner size="sm" color="#F79432" />
              <Text fontSize="xs" color="gray.400">{Math.round(videoUploadProgress)}%</Text>
            </Flex>
          ) : (
            <>
              <svg width="22" height="22" fill="none" stroke="#9CA3AF" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
              <Text fontSize="xs" color="gray.400">Add Video</Text>
            </>
          )}
        </Box>
      </Flex>

      {/* Media grid — 2-column wrap */}
      {(uploadedImages.length > 0 || uploadedVideos.length > 0) && (
        <Box
          display="grid"
          gridTemplateColumns="repeat(2, 120px)"
          gap={3}
          mt={3}
        >
          {uploadedImages.map((img) => (
            <Box key={img.id} position="relative" width="120px" height="90px">
              <img
                src={img.file}
                alt="preview"
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
              />
              <Button
                size="xs"
                colorScheme="red"
                position="absolute"
                top="2px"
                right="2px"
                minW="20px"
                h="20px"
                p={0}
                onClick={() => handleImageDelete(img.file)}
              >
                ×
              </Button>
            </Box>
          ))}
          {uploadedVideos.map((vid) => (
            <Box key={vid.id} position="relative" width="120px" height="90px">
              <video
                src={vid.file}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
              />
              <Button
                size="xs"
                colorScheme="red"
                position="absolute"
                top="2px"
                right="2px"
                minW="20px"
                h="20px"
                p={0}
                onClick={() => handleVideoDelete(vid.file)}
              >
                ×
              </Button>
            </Box>
          ))}
        </Box>
      )}

    </Box>
  );
};

export default MediaUploadSection;
