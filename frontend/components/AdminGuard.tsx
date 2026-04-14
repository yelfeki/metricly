"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useAuth } from "@/components/AuthProvider"

/**
 * Wrap admin-only pages with this component.
 * Redirects non-admin users to /403, renders nothing until role is known.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { role, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && role !== null && role !== "admin") {
      router.replace("/403")
    }
  }, [role, loading, router])

  // While loading or before role is resolved, show nothing to avoid flicker
  if (loading || role === null) return null
  if (role !== "admin") return null

  return <>{children}</>
}
