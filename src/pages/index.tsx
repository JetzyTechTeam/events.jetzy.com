import dynamic from "next/dynamic"
import React from "react"

const HostedEvents = dynamic(() => import("@Jetzy/components/HostedEvents"), { ssr: false })

export default function Home() {
	return <HostedEvents />
}
