import { Box, Button, Flex, Spinner, Text } from "@chakra-ui/react";
import React from "react";

interface VideoUploadBoxProps {
  onVideoChange: (files: FileList | null) => void;
  isUploading: boolean;
  uploadProgress: number;
  handleVideoDelete: (file: string) => void;
  uploadedVideos: {
    file: string;
    id: string;
  }[];
}

const VideoUploadBox: React.FC<VideoUploadBoxProps> = ({
  onVideoChange,
  isUploading,
  uploadProgress,
  uploadedVideos,
  handleVideoDelete,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onVideoChange(e.target.files);
    e.target.value = "";
  };

  const handleClick = () => {
    if (!isUploading) {
      inputRef.current?.click();
    }
  };

  return (
    <>
      {uploadedVideos.map((video) => (
        <Box key={video.id} position="relative" width="270px" mb="5">
          <video
            src={video.file}
            controls
            style={{ width: "100%", borderRadius: "8px", maxHeight: "180px", objectFit: "cover" }}
          />
          <Button
            size="xs"
            colorScheme="red"
            position="absolute"
            top="2"
            right="2"
            onClick={() => handleVideoDelete(video.file)}
          >
            X
          </Button>
        </Box>
      ))}
      <Box
        width="270px"
        height="133px"
        bg="#2B2B2B"
        borderRadius="lg"
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        cursor={isUploading ? "not-allowed" : "pointer"}
        _hover={{ bg: isUploading ? "#2B2B2B" : "#3A3A3A" }}
        onClick={handleClick}
        position="relative"
      >
        <input
          type="file"
          accept="video/*"
          multiple
          ref={inputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {isUploading ? (
          <Flex direction="column" alignItems="center">
            <Spinner size="xl" color="#F79432" />
            <Text mt={2} color="gray.400">
              {Math.round(uploadProgress)}%
            </Text>
          </Flex>
        ) : (
          <>
            <Box
              bg="#2B2B2B"
              borderRadius="full"
              p={2}
              mb={1}
              display="flex"
              justifyContent="center"
              alignItems="center"
            >
              <svg width="24" height="24" fill="none" stroke="#9CA3AF" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </Box>
            <Text fontSize="sm" color="gray.400">
              Add Video
            </Text>
          </>
        )}
      </Box>
    </>
  );
};

export default VideoUploadBox;
