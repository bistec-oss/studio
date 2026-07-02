"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { GlassPanel, GlassInput, Button } from "@/components/ui"
import { Logo } from "@/components/Logo"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error: authError } = await authClient.signIn.email({ email, password })

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
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
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
