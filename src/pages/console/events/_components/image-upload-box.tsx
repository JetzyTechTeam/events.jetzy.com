import { UploadImageSVG } from "@/assets/icons";
import { Box, Button, Flex, Image, Spinner, Text } from "@chakra-ui/react";
import React from "react";

interface ImageUploadBoxProps {
  onImageChange: (files: FileList | null) => void;
  isUploading: boolean;
  uploadProgress: number;
  handleImageDelete: (file: string) => void;
  uploadedImages: {
    file: string;
    id: string;
  }[];
}

export const ImageUploadBox: React.FC<ImageUploadBoxProps> = ({
  onImageChange,
  isUploading,
  uploadProgress,
  uploadedImages,
  handleImageDelete,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onImageChange(e.target.files);
    e.target.value = "";
  };

  const handleClick = () => {
    if (!isUploading) {
      inputRef.current?.click();
    }
  };

  return (
    <>
      {uploadedImages.map((image) => (
        <Box
          key={image.id}
          position="relative"
          width="270px"
          height="133px"
          mb="5"
        >
          <Image
            src={image.file}
            alt="Preview"
            width="100%"
            height="100%"
            objectFit="cover"
            borderRadius="lg"
          />
          {/* Add a delete button for each image */}
          <Button
            size="xs"
            colorScheme="red"
            position="absolute"
            top="2"
            right="2"
            onClick={() => handleImageDelete(image.file)}
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
          accept="image/png, image/jpeg, image/jpg"
          multiple // Allow multiple file selection
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
              <UploadImageSVG />
            </Box>
            <Text fontSize="sm" color="gray.400">
              Add Photo
            </Text>
          </>
        )}
      </Box>
    </>
  );
};
