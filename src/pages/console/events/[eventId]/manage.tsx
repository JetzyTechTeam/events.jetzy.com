import ConsoleLayout from '@/components/layout/ConsoleLayout'
import { authorizedOnly } from '@/lib/authSession'
import { Events } from '@/models/events'
import { GetServerSideProps } from 'next'
import React, { useEffect, useState } from 'react'
import {  Button, Modal, Typography } from 'antd'
import { DateTime } from "luxon"


export default function Manage({event}: any) {
  event = JSON.parse(event)

  const [shareModal, setShareModal] = useState(false)
console.log({shareModal})

  return (
    <ConsoleLayout page={event.name}>
      <div className='flex items-center justify-between gap-x-5 mb-10'>
        <div className='bg-white rounded-xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300'>
          <Typography.Text className='font-bold'>Invite Guests</Typography.Text>
        </div>
        <div className='bg-white rounded-xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300'>
          <Typography.Text className='font-bold'>Send a Blast</Typography.Text>
        </div>
        <div className='bg-white rounded-xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300' onClick={() => setShareModal(true)}>
          <Typography.Text className='font-bold'>Share Event</Typography.Text>
        </div>
      </div>
          <ShareModal shareModal={shareModal} setShareModal={setShareModal} eventSlug={event.slug} />
      <div className='flex flex-col h-full gap-y-5'>
        <div  className='w-full h-[30rem] object-cover object-top rounded-2xl'>
          <img src={event.images} alt={event.name} className='w-full h-[30rem] object-cover object-top rounded-2xl' />
        </div>
        <div className='bg-white rounded-xl p-3 flex flex-col gap-y-3'>
          <Typography.Title level={4}>When & Where</Typography.Title>
          <Typography.Text className='font-semibold'><span className='text-gray-500'>At:</span> {event.location}</Typography.Text>
          <EventDateTime iso={event.startsOn} label="From:" />
          <EventDateTime iso={event.endsOn} label="To:" />
        </div>
      </div>
    </ConsoleLayout>
  )
}

function ShareModal({ shareModal, setShareModal, eventSlug }: { shareModal: boolean, setShareModal: (shareModal: boolean) => void, eventSlug: string }) {
  const [copied, setCopied] = useState(false);

  const sharelink = `${process.env.NEXT_PUBLIC_URL}/${eventSlug}`

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
      <div className='flex flex-col gap-y-3'>
        <Typography.Text className='font-semibold'>Share the link:</Typography.Text>
        <div className='w-full border bg-gray-100 rounded-xl p-2'>{sharelink}</div>
        <Button onClick={onCopy}>{copied ? "Copied!" : "Copy"}</Button>
      </div>
  	</Modal>
  )
}

function EventDateTime({ iso, label }: { iso: string, label: string }) {
  const [formatted, setFormatted] = useState('')
  useEffect(() => {
    setFormatted(DateTime.fromISO(iso).setZone("America/New_York").toLocaleString(DateTime.DATETIME_MED))
  }, [iso])
  return <Typography.Text className='font-semibold'><span className='text-gray-500'>{label}</span> {formatted}</Typography.Text>
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
  const session = await authorizedOnly(context)
	if (!session) return session

  const eventId = context.query.eventId as string
  if (!eventId) return { props: {} }

  const event = await Events.findOne({_id: eventId, isDeleted: false})

  if (!event) return { props: {} }

  return { props: {
    event: JSON?.stringify(event),
  } }
}