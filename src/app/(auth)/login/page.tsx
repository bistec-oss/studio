"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { GlassPanel, GlassInput, Button } from "@/components/ui"
import { Logo } from "@/components/Logo"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    // Legacy escape hatch: an email address still signs in via the email flow
    // (covers accounts predating the username switch).
    const { error: authError } = username.includes("@")
      ? await authClient.signIn.email({ email: username, password })
      : await authClient.signIn.username({ username, password })

    if (authError) {
      setError(authError.message ?? "Invalid credentials")
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-light-background dark:bg-dark-background">
      <GlassPanel className="w-full max-w-sm p-8 space-y-6">
        <div className="flex flex-col items-center text-center">
          <Logo height={48} />
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-3">Sign in to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <GlassInput
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
          <GlassInput
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </GlassPanel>
    </main>
  )
}
