import { Box, Button, Flex, Spinner, Text } from "@chakra-ui/react";
import React from "react";
import { applyMediaOrder } from "@/lib/event-media";

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
  /**
   * Banner order across BOTH lists, as urls. Undefined = images then videos, the order the
   * banner used before hosts could arrange it.
   */
  mediaOrder?: string[];
  /** Called with the full new url order after a drag. Omit to disable reordering. */
  onReorder?: (urls: string[]) => void;
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
  mediaOrder,
  onReorder,
}) => {
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const videoInputRef = React.useRef<HTMLInputElement>(null);

  // One list across both uploads, sequenced the way the banner will show it. Mirrors
  // `eventMedia` on the server side: anything the stored order doesn't name still appears,
  // appended in the legacy images-then-videos order, so a photo added elsewhere (the mobile
  // app) never goes missing from the host's own grid.
  const items = React.useMemo(() => {
    const all = [
      ...uploadedImages.map((m) => ({ ...m, type: "image" as const, url: m.file })),
      ...uploadedVideos.map((m) => ({ ...m, type: "video" as const, url: m.file })),
    ];
    return applyMediaOrder(all, mediaOrder);
  }, [uploadedImages, uploadedVideos, mediaOrder]);

  // Native HTML5 drag-and-drop, same approach as the album form: framer-motion's Reorder is
  // single-axis and can't handle a wrapping 2D grid. Live-swaps on drag-enter. The source
  // index lives in a ref so the reorder itself has no side effects; state only drives the
  // dragged tile's opacity.
  const dragFromRef = React.useRef<number | null>(null);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const canReorder = typeof onReorder === "function" && items.length > 1;

  const startDrag = (idx: number) => {
    dragFromRef.current = idx;
    setDragIndex(idx);
  };
  const endDrag = () => {
    dragFromRef.current = null;
    setDragIndex(null);
  };
  const handleDragEnterTile = (idx: number) => {
    const from = dragFromRef.current;
    if (from === null || from === idx || !onReorder) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    onReorder(next.map((m) => m.file));
    dragFromRef.current = idx;
    setDragIndex(idx);
  };

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

      {/* Media grid — one ordered list; drag to choose what leads the banner */}
      {items.length > 0 && (
        <>
          {canReorder && (
            <Text fontSize="xs" color="#8a8a8a" mt={3} mb={2}>
              Drag to reorder — the first item is what shows on the event banner.
            </Text>
          )}
          <Box display="grid" gridTemplateColumns="repeat(2, 120px)" gap={3} mt={canReorder ? 0 : 3}>
            {items.map((m, idx) => (
              <Box
                key={m.id}
                position="relative"
                width="120px"
                height="90px"
                borderRadius="8px"
                overflow="hidden"
                border={idx === 0 ? "2px solid #F79432" : "1px solid #2a2a2a"}
                opacity={dragIndex === idx ? 0.4 : 1}
                cursor={canReorder ? "grab" : "default"}
                draggable={canReorder}
                onDragStart={(e: React.DragEvent) => {
                  e.dataTransfer.effectAllowed = "move";
                  startDrag(idx);
                }}
                onDragEnter={() => handleDragEnterTile(idx)}
                onDragOver={(e: React.DragEvent) => e.preventDefault()}
                onDragEnd={endDrag}
                onDrop={(e: React.DragEvent) => {
                  e.preventDefault();
                  endDrag();
                }}
              >
                {/* pointerEvents none + draggable false, or the media element swallows the drag */}
                {m.type === "video" ? (
                  <video
                    src={`${m.file}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
                  />
                ) : (
                  <img
                    src={m.file}
                    alt="preview"
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
                  />
                )}
                {m.type === "video" && (
                  <Box position="absolute" bottom="2px" right="2px" bg="blackAlpha.700" borderRadius="sm" px={1} pointerEvents="none">
                    <Text fontSize="9px" color="white" fontWeight="bold">▶</Text>
                  </Box>
                )}
                {idx === 0 && (
                  <Box position="absolute" bottom="2px" left="2px" bg="#F79432" borderRadius="sm" px={1} pointerEvents="none">
                    <Text fontSize="9px" color="black" fontWeight="bold">FIRST</Text>
                  </Box>
                )}
                <Button
                  size="xs"
                  colorScheme="red"
                  position="absolute"
                  top="2px"
                  right="2px"
                  minW="20px"
                  h="20px"
                  p={0}
                  draggable={false}
                  onClick={() => (m.type === "video" ? handleVideoDelete(m.file) : handleImageDelete(m.file))}
                >
                  ×
                </Button>
              </Box>
            ))}
          </Box>
        </>
      )}

    </Box>
  );
};

export default MediaUploadSection;
