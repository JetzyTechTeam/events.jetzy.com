import ConsoleLayout from "@/components/layout/ConsoleLayout";
import { authorizedOnly } from "@/lib/authSession";
import { Events } from "@/models/events";
import { GetServerSideProps } from "next";
import React, { useEffect, useState } from "react";
import { Button, Form, Input, Modal, Typography } from "antd";
import { DateTime } from "luxon";
import axios from "axios";

export default function Manage({ event }: any) {
  event = JSON.parse(event);

  const [shareModal, setShareModal] = useState(false);
  const [inviteGuestsModal, setInviteGuestsModal] = useState(false);

  return (
    <ConsoleLayout page={event.name}>
      <div className="flex items-center justify-between gap-x-5 mb-10">
        <div
          className="bg-white rounded-xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300"
          onClick={() => setInviteGuestsModal(true)}
        >
          <Typography.Text className="font-bold">Invite Guests</Typography.Text>
        </div>
        <div className="bg-white rounded-xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300">
          <Typography.Text className="font-bold">Send a Blast</Typography.Text>
        </div>
        <div
          className="bg-white rounded-xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300"
          onClick={() => setShareModal(true)}
        >
          <Typography.Text className="font-bold">Share Event</Typography.Text>
        </div>
      </div>

      {/* INVITE GUESTS MODAL  */}
      <InviteGuestsModal
        inviteGuestsModal={inviteGuestsModal}
        setInviteGuestsModal={setInviteGuestsModal}
        event={event}
      />

      {/* SHARE MODAL  */}
      <ShareModal
        shareModal={shareModal}
        setShareModal={setShareModal}
        eventSlug={event.slug}
      />
      <div className="flex flex-col h-full gap-y-5">
        <div className="w-full h-[30rem] object-cover object-top rounded-2xl">
          <img
            src={event.images}
            alt={event.name}
            className="w-full h-[30rem] object-cover object-top rounded-2xl"
          />
        </div>
        <div className="bg-white rounded-xl p-3 flex flex-col gap-y-3">
          <Typography.Title level={4}>When & Where</Typography.Title>
          <Typography.Text className="font-semibold">
            <span className="text-gray-500">At:</span> {event.location}
          </Typography.Text>
          <EventDateTime iso={event.startsOn} label="From:" />
          <EventDateTime iso={event.endsOn} label="To:" />
        </div>
      </div>
    </ConsoleLayout>
  );
}

function InviteGuestsModal({
  inviteGuestsModal,
  setInviteGuestsModal,
  event,
}: {
  inviteGuestsModal: boolean;
  setInviteGuestsModal: (inviteGuestsModal: boolean) => void;
  event: any;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");


  const [form] = Form.useForm();

  const handleAddEmail = () => {
    form.validateFields().then((values) => {
      const email = values.email.trim();
      if (email && !emails.includes(email)) {
        setEmails([...emails, email]);
        form.resetFields(["email"]);
      }
    });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEmail();
    }
  };

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);

  const onSendInvitation = async () => {
    setLoading(true);
    try {
      await axios.post("/api/send-invites", {
        emails,
        message,
        subject: `Hi, Jetzy Events invite you to join ${event.name}!`,
        eventLink: `${process.env.NEXT_PUBLIC_URL}/${event.slug}`,
      });
      setLoading(false);
      setStep(1);
      setEmails([]);
      setMessage("");
      setInviteGuestsModal(false);
    } catch (error) {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!inviteGuestsModal) {
      setStep(1);
      setEmails([]);
      form.resetFields();
    }
  }, [inviteGuestsModal, form]);

  return (
    <Modal
      centered
      open={inviteGuestsModal}
      footer={null}
      onCancel={() => setInviteGuestsModal(false)}
      width={step === 2 ? 900 : 400}
    >
      <div className="flex flex-col gap-y-3">
        {step === 1 && (
          <>
            {" "}
            <Typography.Title level={4}>Invite Guests</Typography.Title>
            <Typography.Text className="font-semibold">
              Invite your guests by email:
            </Typography.Text>
            <Form form={form} autoComplete="off" onFinish={() => {}}>
              <Form.Item
                name="email"
                rules={[
                  { required: true, message: "Please enter an email" },
                  { type: "email", message: "Please enter a valid email" },
                ]}
              >
                <Input
                  type="email"
                  size="large"
                  placeholder="Enter your guest's email"
                  className="w-full bg-transparent outline-none"
                  onKeyDown={handleInputKeyDown}
                  suffix={
                    <Button type="primary" onClick={handleAddEmail}>
                      Add
                    </Button>
                  }
                />
              </Form.Item>
            </Form>
            {emails.length > 0 && (
              <div className="mt-2">
                <Typography.Text className="font-semibold">
                  Inviting {emails.length} Emails:
                </Typography.Text>
                <ul className="list-disc">
                  {emails.map((email) => (
                    <li
                      key={email}
                      className="flex items-center justify-between"
                    >
                      <span>{email}</span>
                      <Button
                        type="text"
                        size="small"
                        danger
                        onClick={() =>
                          setEmails(emails.filter((e) => e !== email))
                        }
                        style={{ marginLeft: 8 }}
                      >
                        x
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button disabled={emails.length === 0} onClick={handleNext}>
              Next
            </Button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="flex items-start justify-between p-5">
              <div>
                <Typography.Title level={4}>
                  Review Invited Emails
                </Typography.Title>
                <Typography.Text className="font-semibold">
                  Here are the emails you have entered:
                </Typography.Text>
                <ul className="list-disc pl-5">
                  {emails.map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                </ul>
              </div>
              <div className="border rounded-xl p-2 flex flex-col gap-y-3">
                <Typography.Text className="font-semibold">
                  Hi, Jetzy Events invite you to join {event.name}.
                </Typography.Text>
                <Input.TextArea
                  rows={3}
                  placeholder="Enter a custom message here..."
                  onChange={e => setMessage(e.target.value)}
                />
                <Typography.Text className="font-semibold">
                  RSVP: {process.env.NEXT_PUBLIC_URL}/{event.slug}
                </Typography.Text>

                <Typography.Text>
                  We will send guests an invitation link to register for the
                  event.
                </Typography.Text>
              </div>
            </div>
            <div className="flex items-center justify-between gap-x-2 mt-4">
              <Button onClick={handleBack}>Back</Button>
              <Button type="primary" onClick={onSendInvitation}>Send Invitations</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ShareModal({
  shareModal,
  setShareModal,
  eventSlug,
}: {
  shareModal: boolean;
  setShareModal: (shareModal: boolean) => void;
  eventSlug: string;
}) {
  const [copied, setCopied] = useState(false);

  const sharelink = `${process.env.NEXT_PUBLIC_URL}/${eventSlug}`;

  const onCopy = () => {
    navigator.clipboard.writeText(sharelink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Modal
      centered
      open={shareModal}
      footer={null}
      onCancel={() => setShareModal(false)}
    >
      <div className="flex flex-col gap-y-3">
        <Typography.Text className="font-semibold">
          Share the link:
        </Typography.Text>
        <div className="w-full border bg-gray-100 rounded-xl p-2">
          {sharelink}
        </div>
        <Button onClick={onCopy}>{copied ? "Copied!" : "Copy"}</Button>
      </div>
    </Modal>
  );
}

function EventDateTime({ iso, label }: { iso: string; label: string }) {
  const [formatted, setFormatted] = useState("");
  useEffect(() => {
    setFormatted(
      DateTime.fromISO(iso)
        .setZone("America/New_York")
        .toLocaleString(DateTime.DATETIME_MED)
    );
  }, [iso]);
  return (
    <Typography.Text className="font-semibold">
      <span className="text-gray-500">{label}</span> {formatted}
    </Typography.Text>
  );
}

export const getServerSideProps: GetServerSideProps<any, any> = async (
  context
) => {
  const session = await authorizedOnly(context);
  if (!session) return session;

  const eventId = context.query.eventId as string;
  if (!eventId) return { props: {} };

  const event = await Events.findOne({ _id: eventId, isDeleted: false });

  if (!event) return { props: {} };

  return {
    props: {
      event: JSON?.stringify(event),
    },
  };
};
