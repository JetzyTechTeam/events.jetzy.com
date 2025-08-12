import {
  setSelectedTickets,
  toggleCheckoutForm,
} from "@Jetzy/redux/reducers/checkoutSlice";
import { useAppDispatch } from "@Jetzy/redux/stores";
import React, { useState } from "react";
import { waitUntil } from "@Jetzy/lib/utils";
import Spinner from "./misc/Spinner";
import { Error } from "@Jetzy/lib/_toaster";
import { IEvent } from "@/models/events/types";
import { CheckmarkSVG } from "@/assets/icons";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Textarea,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useSession } from "next-auth/react";
import Linkify from "linkify-react";
import { sendGAEvent } from "@next/third-parties/google";

type Props = {
  event: IEvent;
};

const EventTicketsComponent: React.FC<Props> = ({ event }) => {
  const eventId = event._id.toString();

  const session = useSession();

  // format the event tickets
  const ticketsItems = event.tickets.map((ticket) => {
    return {
      id: ticket._id.toString(),
      name: ticket.name,
      price: ticket.price,
      description: ticket.desc,
      quantity: 1,
      isSelected: event.isPaid ? true : false,
      priceId: ticket.stripeProductId,
      eventId: event._id.toString(),
    };
  });

  // State for ticket quantities
  const [tickets, setTickets] = useState(ticketsItems);

  // Clone a static verion of the tickets so when increasing the qty the amount is not recalculated from the original price
  const staticTickets = ticketsItems.copyWithin(0, 0);

  // State for loader
  const [isLoading, setLoader] = useState(false);

  // State for checkout modal
  const dispatcher = useAppDispatch();

  // Handle increment/decrement for tickets
  const handleQuantityChange = (id: string, delta: number) => {
    setTickets((prevTickets) =>
      prevTickets.map((ticket, index) => {
        const newQty = Math.max(1, ticket.quantity + delta);
        const ticketItem = ticketsItems[index];

        return ticket.id === id
          ? {
              ...ticket,
              quantity: newQty,
              price:
                newQty === 0 ? ticketItem.price : newQty * ticketItem.price,
            }
          : ticket;
      })
    );
  };

  const handleTicketSelection = (id: string) => {
    setTickets((prevTickets) =>
      prevTickets.map((ticket) => {
        return ticket.id === id
          ? { ...ticket, isSelected: !ticket.isSelected }
          : ticket;
      })
    );
  };

  const showCheckoutForm = (showCheckout: boolean) => {
    setLoader(true);
    // make sure the ticket at least one is selected
    const hasSelected = tickets.some((ticket) => ticket.isSelected);
    if (event.isPaid && !hasSelected) {
      alert("Please select at least one ticket.");
      setLoader(false);
      Error("Ticket Required", "Please select at least one ticket.");
      return;
    }

    const ticketsSelected = tickets
      .map((ticket, index) => ({
        id: ticket.id,
        name: ticket.name,
        price: ticketsItems[index].price,
        description: ticket.description,
        quantity: ticket.quantity,
        isSelected: ticket.isSelected,
        priceId: ticket.priceId,
        eventId: ticket.eventId,
      }))
      .filter((ticket) => ticket.isSelected);

    dispatcher(setSelectedTickets(ticketsSelected));

    waitUntil(500).then(() => {
      setLoader(false);
      dispatcher(toggleCheckoutForm(showCheckout));
    });
  };

  return (
    <>
      {/* Main Container */}
      <div
        className="max-w-4xl mx-auto bg-[#5656561e] border border-[#434343] rounded-2xl shadow-2xl overflow-hidden mt-8"
        id="event-tickets"
      >
        {/* Content Section */}
        <div className="p-6 sm:p-8">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
            <div className="text-center sm:text-left">
              <h2 className="text-xl sm:text-2xl font-bold">Tickets</h2>
              <p className="text-[#bbbbbb] text-sm sm:text-base">
                Select your tickets and proceed to checkout.
              </p>
            </div>
          </div>

          {/* Ticket Section */}
          <div className="space-y-6">
            {tickets.map((ticket, index) => (
              <div
                key={ticket.id}
                className={`relative bg-[#2b2b2b] p-4 rounded-lg cursor-pointer border-2 ${
                  ticket.isSelected ? "border-jetzy" : "border-transparent"
                }`}
                onClick={() => { 
                  handleTicketSelection(ticket.id)
                  sendGAEvent({
                    category: "Event",
                    action: "Ticket Selected",
                    label: ticket.name,
                    eventName: event.name,
                  });
                }}
              >
                {ticket.isSelected && (
                  <span className="absolute top-2 right-2">
                    <CheckmarkSVG />
                  </span>
                )}
                <div className="flex sm:flex-row justify-between items-center w-full">
                  <div className="md:text-left xs:text-center">
                    <h3 className="font-semibold text-lg">{ticket.name}</h3>
                    <p className="text-xs my-2">
                      Select your tickets and proceed to checkout
                    </p>
                    <p className="text-xs my-2">
                      <Linkify options={{
                        target: '_blank',
                        className: 'text-orange-600 underline hover:text-orange-800',
                      }}>
                        {ticket.description}
                      </Linkify>
                    </p>
                    <div className="flex items-center justify-between w-full">
                      <p className="text-jetzy font-bold text-xl">
                        {staticTickets[index].price.toLocaleString("en-US", {
                          style: "currency",
                          currency: "usd",
                        })}
                      </p>
                      {event.isPaid && ticket.isSelected && (
                        <div
                          className="flex items-center space-x-4 mt-4 sm:mt-0 text-slate-800 absolute bottom-5 right-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleQuantityChange(ticket.id, -1)}
                            className="bg-black text-white w-8 h-8 rounded-full flex items-center justify-center"
                          >
                            -
                          </button>
                          <p className="text-white text-lg font-semibold">
                            {ticket.quantity}
                          </p>
                          <button
                            onClick={() => handleQuantityChange(ticket.id, 1)}
                            className="bg-black text-white w-8 h-8 rounded-full flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Checkout Section */}
          <div className="flex justify-between items-center my-4">
            {/* Total Price to pay */}
            <div className="text-center sm:text-right">
              <h3 className="text-2xl font-semibold">
                {tickets
                  .reduce(
                    (acc, ticket) =>
                      ticket.isSelected ? acc + ticket.price : acc,
                    0
                  )
                  .toLocaleString("en-US", {
                    style: "currency",
                    currency: "usd",
                  })}
              </h3>
            </div>

            <button
              disabled={isLoading}
              onClick={() => {
                showCheckoutForm(true)
                sendGAEvent({ 
                  category: "Event",
                  action: "Checkout Button Clicked",
                  label: event.name, })
              }}
              className="bg-jetzy text-black font-bold px-6 py-3 rounded-full hover:scale-105 shadow-lg disabled:opacity-50"
            >
              {isLoading ? <Spinner /> : "Checkout"}
            </button>
          </div>
        </div>
      </div>

      {/* map section  */}
      {/* <div className="max-w-4xl mx-auto mt-5 bg-[#5656561e] border border-[#434343] rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-xl">Event Location</h1>
          <a
            href={`https://www.google.com/maps?q=${encodeURIComponent(
              event.location
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-jetzy p-2 rounded-xl"
          >
            <DirectionSVG />
          </a>
        </div>
        <p className="text-xl">{event.location}</p>
        <div className="mt-4 w-full h-64 rounded-xl overflow-hidden">
          <iframe
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.google.com/maps?q=${encodeURIComponent(
              event.location
            )}&output=embed`}
          ></iframe>
        </div>
      </div> */}

      {/* comments section  */}
      <CommentsSection eventId={eventId} currentUser={session?.data?.user as UserType} />
    </>
  );
};

export default EventTicketsComponent;

type CommentType = {
  _id: string;
  userId: { email: string };
  createdAt: string;
  comment: string;
  parentCommentId: string | "root";
};

type UserType = {
  name?: string | null | undefined; email?: string | null | undefined; image?: string | null | undefined; 
};

type CommentItemProps = {
  comment: CommentType;
  groupedComments: Record<string, CommentType[]>;
  replyingTo: string | null;
  setReplyingTo: React.Dispatch<React.SetStateAction<string | null>>;
  replyTextMap: Record<string, string>;
  setReplyTextMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  replyMutation: any;
  editCommentId: string | null;
  setEditCommentId: React.Dispatch<React.SetStateAction<string | null>>;
  editTextMap: Record<string, string>;
  setEditTextMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  editMutation: any;
  deleteMutation: any;
  currentUser: UserType | null;
};

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  groupedComments,
  replyingTo,
  setReplyingTo,
  replyTextMap,
  setReplyTextMap,
  replyMutation,
  editCommentId,
  setEditCommentId,
  editTextMap,
  setEditTextMap,
  editMutation,
  deleteMutation,
  currentUser,
}) => {
  const toast = useToast();

  const isEditing = editCommentId === comment._id;

  const handleEditSave = () => {
    const newText = editTextMap[comment._id]?.trim();
    if (!newText) {
      toast({
        title: "Empty comment",
        description: "Comment cannot be empty.",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    editMutation.mutate({ commentId: comment._id, newComment: newText });
  };

  const handleDelete = () => {
    if (
      window.confirm(
        "Are you sure you want to delete this comment? This action cannot be undone."
      )
    ) {
      deleteMutation.mutate(comment._id);
    }
  };

  return (
    <div className="bg-[#060E1A] rounded-xl p-3">
      <div className="mb-2 flex justify-between items-start">
        <div>
          <h3 className="text-[15px] text-[#FBFBFB] font-medium">
            {comment.userId.email}
          </h3>
          <p className="text-xs text-[#8F8F8F]">
            {new Date(comment.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        {currentUser?.email === comment.userId.email && (
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="ghost"
              color="orange"
              onClick={() => {
                if (isEditing) {
                  setEditCommentId(null);
                  setEditTextMap((prev) => ({ ...prev, [comment._id]: "" }));
                } else {
                  setEditCommentId(comment._id);
                  setEditTextMap((prev) => ({
                    ...prev,
                    [comment._id]: comment.comment,
                  }));
                  setReplyingTo(null); // Close reply if editing
                }
              }}
            >
              {isEditing ? "Cancel" : "Edit"}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              color="red.400"
              onClick={handleDelete}
              isLoading={deleteMutation.isLoading}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <>
          <Textarea
            size="sm"
            value={editTextMap[comment._id] || ""}
            onChange={(e) =>
              setEditTextMap((prev) => ({
                ...prev,
                [comment._id]: e.target.value,
              }))
            }
            bg="gray.800"
            color="white"
            borderColor="gray.600"
            borderRadius="lg"
          />
          <div className="flex gap-2 mt-2">
            <Button
              size="xs"
              colorScheme="orange"
              onClick={handleEditSave}
              isLoading={editMutation.isLoading}
            >
              Save
            </Button>
            <Button
              size="xs"
              variant="outline"
              color="gray.300"
              _hover={{ color: "white" }}
              onClick={() => {
                setEditCommentId(null);
                setEditTextMap((prev) => ({ ...prev, [comment._id]: "" }));
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-white">{comment.comment}</p>

          <Button
            variant="unstyled"
            size="xs"
            color="orange"
            mt="2"
            onClick={() =>
              setReplyingTo(replyingTo === comment._id ? null : comment._id)
            }
          >
            Reply
          </Button>

          {replyingTo === comment._id && (
            <div className="mt-2 space-y-2">
              <Textarea
                placeholder="Write your reply..."
                size="sm"
                value={replyTextMap[comment._id] || ""}
                onChange={(e) =>
                  setReplyTextMap((prev) => ({
                    ...prev,
                    [comment._id]: e.target.value,
                  }))
                }
                bg="gray.800"
                color="white"
                borderColor="gray.600"
                borderRadius="lg"
              />
              <div className="flex gap-2">
                <Button
                  size="xs"
                  colorScheme="orange"
                  onClick={() => {
                    replyMutation.mutate({
                      commentId: comment._id,
                      reply: replyTextMap[comment._id],
                    });
                  }}
                  isLoading={replyMutation.isLoading}
                >
                  Submit
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  color="gray.300"
                  _hover={{ color: "white" }}
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyTextMap((prev) => ({
                      ...prev,
                      [comment._id]: "",
                    }));
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {groupedComments[comment._id]?.length > 0 && (
        <div className="pl-4 mt-3 space-y-3 border-l border-gray-700">
          {groupedComments[comment._id].map((reply) => (
            <CommentItem
              key={reply._id}
              comment={reply}
              groupedComments={groupedComments}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              replyTextMap={replyTextMap}
              setReplyTextMap={setReplyTextMap}
              replyMutation={replyMutation}
              editCommentId={editCommentId}
              setEditCommentId={setEditCommentId}
              editTextMap={editTextMap}
              setEditTextMap={setEditTextMap}
              editMutation={editMutation}
              deleteMutation={deleteMutation}
              currentUser={currentUser}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CommentsSection = ({
  eventId,
  currentUser,
}: {
  eventId: string;
  currentUser: UserType | null;
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [comment, setComment] = React.useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});
  const [editCommentId, setEditCommentId] = useState<string | null>(null);
  const [editTextMap, setEditTextMap] = useState<Record<string, string>>({});
  const toast = useToast();

  const { data: session } = useSession();

  const {
    data: comments = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["eventComments", eventId],
    queryFn: async () => {
      const response = await axios.get(
        `/api/events/comments/get?eventId=${eventId}`
      );
      return response.data;
    },
    enabled: !!eventId,
  });

  const commentMutation = useMutation({
    mutationKey: ["postComment"],
    mutationFn: async (comment: string) => {
      const response = await axios.post("/api/events/comments/create", {
        comment,
        eventId,
      });
      return response.data;
    },
    onSuccess: () => {
      setComment("");
      onClose();
      refetch();
      toast({
        title: "Comment Posted.",
        description: "Your comment has been successfully posted.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    },
    onError: (err) => {
      console.error("Error posting comment:", err);
      toast({
        title: "Error Posting Comment.",
        description: "There was an error posting your comment.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    },
  });

  const replyMutation = useMutation({
    mutationKey: ["postReply"],
    mutationFn: async ({
      commentId,
      reply,
    }: {
      commentId: string;
      reply: string;
    }) => {
      const response = await axios.post("/api/events/comments/reply", {
        eventId,
        commentId,
        reply,
      });
      return response.data;
    },
    onSuccess: (_data, variables) => {
      const { commentId } = variables;
      setReplyTextMap((prev) => ({ ...prev, [commentId]: "" }));
      setReplyingTo(null);
      refetch();
      toast({
        title: "Reply Posted.",
        description: "Your reply has been successfully posted.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    },
    onError: (err) => {
      console.error("Error posting reply:", err);
      toast({
        title: "Error Posting Reply.",
        description: "There was an error posting your reply.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    },
  });

  const editMutation = useMutation({
    mutationKey: ["editComment"],
    mutationFn: async ({
      commentId,
      newComment,
    }: {
      commentId: string;
      newComment: string;
    }) => {
      const response = await axios.put("/api/events/comments/edit", {
        eventId,
        commentId,
        newComment,
      });
      return response.data;
    },
    onSuccess: () => {
      setEditCommentId(null);
      setEditTextMap({});
      refetch();
      toast({
        title: "Comment Edited.",
        description: "Your comment has been successfully updated.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    },
    onError: (err) => {
      console.error("Error editing comment:", err);
      toast({
        title: "Error Editing Comment.",
        description: "There was an error updating your comment.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ["deleteComment"],
    mutationFn: async (commentId: string) => {
      const response = await axios.delete(
        `/api/events/comments/delete?eventId=${eventId}&commentId=${commentId}`
      );
      return response.data;
    },
    onSuccess: () => {
      refetch();
      toast({
        title: "Comment Deleted.",
        description: "The comment has been deleted.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    },
    onError: (err) => {
      console.error("Error deleting comment:", err);
      toast({
        title: "Error Deleting Comment.",
        description: "There was an error deleting the comment.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    },
  });

  const groupedComments = React.useMemo(() => {
    return comments.reduce((acc: Record<string, CommentType[]>, comment: CommentType) => {
      const parentId = comment.parentCommentId || "root";
      if (!acc[parentId]) acc[parentId] = [];
      acc[parentId].push(comment);
      return acc;
    }, {});
  }, [comments]);

  return (
    <div className="max-w-4xl mx-auto mt-5 bg-[#5656561e] border border-[#434343] rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-xl">Comments</h1>
        {session === null ? <></> : <p className="text-jetzy p-2 rounded-xl cursor-pointer" onClick={onOpen}>
            Write a comment
          </p>}
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-20">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          {groupedComments["root"]?.map((comment: CommentType) => (
            <CommentItem
              key={comment._id}
              comment={comment}
              groupedComments={groupedComments}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              replyTextMap={replyTextMap}
              setReplyTextMap={setReplyTextMap}
              replyMutation={replyMutation}
              editCommentId={editCommentId}
              setEditCommentId={setEditCommentId}
              editTextMap={editTextMap}
              setEditTextMap={setEditTextMap}
              editMutation={editMutation}
              deleteMutation={deleteMutation}
              currentUser={currentUser}
            />
          ))}
        </div>
      )}

      <Modal isCentered isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent bg="#1E1E1E">
          <ModalHeader>Write a Comment</ModalHeader>
          <ModalBody>
            <Textarea
              value={comment}
              placeholder="Enter your comment here..."
              onChange={(e) => setComment(e.target.value)}
              bg="#090C10"
              border="1px solid #444444"
            />
          </ModalBody>

          <ModalFooter display="flex" flexDirection="column" gap="3">
            <Button
              colorScheme="orange"
              w="full"
              onClick={() => comment.trim() && commentMutation.mutate(comment)}
              isLoading={commentMutation.isPending}
            >
              Post
            </Button>
            <Button variant="unstyled" w="full" color="white" onClick={onClose}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};