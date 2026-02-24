import React from "react"
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalCloseButton,
    VStack,
    HStack,
    Avatar,
    Text,
    Box,
    Spinner,
} from "@chakra-ui/react"

interface User {
    _id: string
    firstName: string
    lastName: string
    image?: string
    email: string
}

interface ReactionsListModalProps {
    isOpen: boolean
    onClose: () => void
    users: User[]
    title: string
    isLoading?: boolean
    extraContent?: React.ReactNode
}

const ReactionsListModal: React.FC<ReactionsListModalProps> = ({
    isOpen,
    onClose,
    users,
    title,
    isLoading = false,
    extraContent,
}) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} isCentered size="sm">
            <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
            <ModalContent borderRadius="xl" bg="#1E1E1E">
                <ModalHeader borderBottom="1px solid" borderColor="#434343" pb={3} color="white">
                    <Text fontSize="md" fontWeight="bold">
                        {title}
                    </Text>
                </ModalHeader>
                <ModalCloseButton color="white" />
                <ModalBody py={3} maxH="400px" overflowY="auto">
                    {extraContent && (
                        <Box mb={4}>
                            {extraContent}
                        </Box>
                    )}
                    {isLoading ? (
                        <Box display="flex" justifyContent="center" py={8}>
                            <Spinner color="blue.500" />
                        </Box>
                    ) : users.length === 0 ? (
                        <Box py={8} textAlign="center">
                            <Text color="#bbbbbb" fontSize="sm">
                                No one yet
                            </Text>
                        </Box>
                    ) : (
                        <VStack align="stretch" spacing={2}>
                            {users.map((user) => (
                                <HStack
                                    key={user._id}
                                    p={2}
                                    borderRadius="lg"
                                    _hover={{ bg: "#2b2b2b" }}
                                    cursor="pointer"
                                >
                                    <Avatar
                                        size="sm"
                                        name={`${user.firstName} ${user.lastName}`}
                                        src={user.image || ""}
                                    />
                                    <Box flex="1">
                                        <Text color="white" fontSize="sm" fontWeight="600">
                                            {user.firstName} {user.lastName}
                                        </Text>
                                        <Text color="#bbbbbb" fontSize="xs">
                                            {user.email}
                                        </Text>
                                    </Box>
                                </HStack>
                            ))}
                        </VStack>
                    )}
                </ModalBody>
            </ModalContent>
        </Modal>
    )
}

export default ReactionsListModal
