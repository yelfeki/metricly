"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { setTokenProvider, getMyRole } from "@/lib/api"
import type { UserRoleValue } from "@/lib/types"

interface AuthContextValue {
  user: User | null
  loading: boolean
  role: UserRoleValue | null
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, role: null })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<UserRoleValue | null>(null)

  useEffect(() => {
    const supabase = createClient()

    // Register a token provider so every API call automatically gets the
    // current access token without needing to thread it through every component.
    setTokenProvider(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      return session?.access_token ?? null
    })

    // Seed initial state from the cached session (no network round-trip).
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Keep state in sync across tabs / token refreshes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Fetch role whenever user changes
  useEffect(() => {
    if (!user) {
      setRole(null)
      return
    }
    getMyRole()
      .then(r => setRole(r.role as UserRoleValue))
      .catch(() => setRole("client"))
  }, [user?.id])

  return (
    <AuthContext.Provider value={{ user, loading, role }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
