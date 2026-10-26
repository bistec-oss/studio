"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Input, Button, Panel } from "@/components/ui"
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

  // A bezel card on the canvas (021 design.md §5): the Bistec Studio logo
  // (021 A6), a muted line, the fields and a full-width primary Button.
  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas text-fg px-4 py-12">
      <Panel bezel className="w-full max-w-sm p-8">
        {/* The page's one h1, for screen readers (014 FR-14): the logo is an img. */}
        <h1 className="sr-only">Sign in to Studio</h1>
        <Logo height={48} />
        <p className="mt-3 text-ui-sm text-fg-muted">Sign in to continue</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <Input
            label="Username"
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
          <Input
            label="Password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && (
            <p className="text-ui-sm text-status-failed">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Panel>
    </main>
  )
}
