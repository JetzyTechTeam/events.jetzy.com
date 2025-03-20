"use client"

import { type EdgeStoreRouter } from "@Jetzy/pages/api/edgestore/[...edgestore]"
import { createEdgeStoreProvider } from "@edgestore/react"

const { EdgeStoreProvider, useEdgeStore } = createEdgeStoreProvider<EdgeStoreRouter>()

export { EdgeStoreProvider, useEdgeStore }
