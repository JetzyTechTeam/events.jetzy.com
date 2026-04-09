import React, { useRef } from "react";
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    Button,
    VStack,
    Text,
    Box,
    useToast
} from "@chakra-ui/react";
import { QRCodeCanvas } from "qrcode.react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

interface QRCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    url: string;
    title?: string;
}

const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, url, title }) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const toast = useToast();

    const downloadQRCode = () => {
        const canvas = canvasRef.current?.querySelector("canvas");
        if (canvas) {
            const pngUrl = canvas
                .toDataURL("image/png")
                .replace("image/png", "image/octet-stream");
            const downloadLink = document.createElement("a");
            downloadLink.href = pngUrl;
            downloadLink.download = `${title || "event"}-qr-code.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);

            toast({
                title: "QR Code Downloaded",
                status: "success",
                duration: 2000,
                isClosable: true,
            });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} isCentered size="sm">
            <ModalOverlay backdropFilter="blur(4px)" />
            <ModalContent bg="#1E1E1E" color="white" borderRadius="2xl" border="1px solid" borderColor="#434343">
                <ModalHeader borderBottom="1px solid" borderColor="#434343">
                    {title || "Share QR Code"}
                </ModalHeader>
                <ModalCloseButton />
                <ModalBody py={8}>
                    <VStack spacing={6}>
                        <Box 
                            p={4} 
                            bg="white" 
                            borderRadius="xl" 
                            ref={canvasRef}
                            boxShadow="xl"
                        >
                            <QRCodeCanvas 
                                value={url} 
                                size={200}
                                level="H"
                                includeMargin={true}
                            />
                        </Box>
                        <VStack spacing={2} textAlign="center">
                            <Text fontSize="sm" color="#bbbbbb">
                                Scan this code to visit the {title?.toLowerCase() || "event"}.
                            </Text>
                            <Text fontSize="xs" color="#666" wordBreak="break-all" maxW="250px">
                                {url}
                            </Text>
                        </VStack>
                    </VStack>
                </ModalBody>
                <ModalFooter borderTop="1px solid" borderColor="#434343">
                    <Button variant="ghost" mr={3} onClick={onClose} color="white" _hover={{ bg: "whiteAlpha.100" }}>
                        Close
                    </Button>
                    <Button 
                        leftIcon={<ArrowDownTrayIcon className="w-4 h-4" />}
                        bg="#F79432" 
                        color="black"
                        _hover={{ bg: "#e58220" }}
                        onClick={downloadQRCode}
                    >
                        Download
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

export default QRCodeModal;
