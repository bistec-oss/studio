'use client'

import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, ToggleLeft, ToggleRight, Star, CheckCircle, XCircle, Eye, EyeOff, ShieldAlert } from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { GlassInput } from '@/components/ui/GlassInput'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { QueryError } from '@/components/ui/QueryError'
import { TeamClaudeTokenCard } from '@/components/team/TeamClaudeTokenCard'
import { ApiKeysCard } from '@/components/team/ApiKeysCard'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { pickServingImageProvider } from '@/providers/imageCapabilities'
import type { AdminProvider as Provider, ProviderSlot, ChannelStatus, ChannelMap } from '@/lib/api-types'

// Team settings: AI providers + social channels (moved here from the old
// /admin/settings tab page — the routes are team-scoped, and every setting
// here now applies to the whole team, so it belongs beside the team's Claude
// token and API keys rather than under /admin). Gated on isTeamAdmin, not
// app-role admin: a team's own admin manages it regardless of app role.

// lucide-react 1.x removed brand icons — inline equivalents (stroke style
// matches lucide so they sit naturally beside the other icons).
function InstagramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

function LinkedinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectProvider(key: string): { name: string; label: string } | null {
  if (key.startsWith('sk-ant-')) return { name: 'anthropic', label: 'Claude (Anthropic)' }
  if (key.startsWith('sk-')) return { name: 'openai', label: 'GPT (OpenAI)' }
  if (key.startsWith('AIza')) return { name: 'gemini', label: 'Gemini (Google)' }
  return null
}

const DETECTED_NAMES: Record<string, string> = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' }

function maskKey(prefix: string) {
  return `${prefix}••••••••`
}

// ─── Register Provider Form ───────────────────────────────────────────────────

function RegisterForm({ onSuccess, allowCopySlot }: { onSuccess: () => void; allowCopySlot: boolean }) {
  const [apiKey, setApiKey] = useState('')
  // In CLI mode there is no COPY slot to choose — copy runs on the Claude OAuth
  // chain, so IMAGE is the only registrable slot and the toggle is hidden.
  const [slot, setSlot] = useState<ProviderSlot>(allowCopySlot ? 'COPY' : 'IMAGE')
  const [providerName, setProviderName] = useState('')
  const [label, setLabel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const detected = detectProvider(apiKey)
  const isUnknown = apiKey.length > 4 && !detected

  async function register() {
    setError('')
    setLoading(true)
    try {
      const body: Record<string, unknown> = { apiKey, slot }
      if (isUnknown) { body.providerName = providerName; body.label = label }
      await apiFetch('/api/admin/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setApiKey(''); setProviderName(''); setLabel('')
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-panel rounded-xl p-5 space-y-4 border border-primary/20">
      <h3 className="text-sm font-semibold text-light-text dark:text-dark-text">Register new provider</h3>

      <div className="space-y-3">
        <div className="relative">
          <GlassInput
            type={showKey ? 'text' : 'password'}
            placeholder={allowCopySlot ? 'API key (sk-ant-…, sk-…, or AIza… Gemini for images)' : 'Image API key (sk-… OpenAI or AIza… Gemini)'}
            value={apiKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowKey(v => !v)}
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
            aria-pressed={showKey}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-light-text-muted dark:text-dark-text-muted"
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {detected && (
          <p className="text-xs text-primary dark:text-primary-light font-medium">
            ✓ {DETECTED_NAMES[detected.name]} detected
            {detected.name === 'gemini' && ' — image generation only'}
          </p>
        )}
        {isUnknown && (
          <div className="space-y-2">
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted">Unknown key format — enter provider details</p>
            <GlassInput
              placeholder="Provider name (e.g. groq)"
              value={providerName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProviderName(e.target.value)}
            />
            <GlassInput
              placeholder="Display label (e.g. Llama 3 (Groq))"
              value={label}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
            />
          </div>
        )}

        {allowCopySlot ? (
          <SegmentedToggle
            options={[
              { value: 'COPY', label: 'COPY' },
              { value: 'IMAGE', label: 'IMAGE' },
            ]}
            value={slot}
            onChange={v => setSlot(v as ProviderSlot)}
          />
        ) : (
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
            Registered for <span className="font-semibold">image generation</span> (an OpenAI or Gemini
            key) — the only key this team needs. Copy is generated by Claude on the OAuth chain.
          </p>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <Button variant="primary" size="sm" onClick={register} disabled={loading || !apiKey}>
          {loading ? 'Validating…' : 'Register'}
        </Button>
      </div>
    </div>
  )
}

// ─── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({ provider, onRefresh }: { provider: Provider; onRefresh: () => void }) {
  const [confirming, setConfirming] = useState(false)
  // The server refuses to default a disabled IMAGE row (005 FR-03), so don't offer it.
  const starBlocked = provider.slot === 'IMAGE' && !provider.isEnabled

  async function toggle(field: 'isEnabled' | 'isDefault', value: boolean) {
    try {
      await apiFetch(`/api/admin/providers/${provider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function remove() {
    try {
      await apiFetch(`/api/admin/providers/${provider.id}`, { method: 'DELETE' })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  return (
    <div className="glass-panel rounded-xl p-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-light-text dark:text-dark-text truncate">{provider.label}</span>
          <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary dark:text-primary-light">
            {provider.slot}
          </span>
          {provider.isDefault && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Star size={11} /> Default
            </span>
          )}
        </div>
        <p className="font-mono text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
          {maskKey(provider.keyPrefix)}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => toggle('isEnabled', !provider.isEnabled)}
          aria-pressed={provider.isEnabled}
          aria-label={`Enable ${provider.label}`}
          className="text-light-text-muted dark:text-dark-text-muted hover:text-primary dark:hover:text-primary-light transition-colors"
          title={provider.isEnabled ? 'Disable' : 'Enable'}
        >
          {provider.isEnabled
            ? <ToggleRight size={20} className="text-primary dark:text-primary-light" />
            : <ToggleLeft size={20} />}
        </button>
        <button
          onClick={() => toggle('isDefault', true)}
          aria-pressed={provider.isDefault}
          aria-label={`Set ${provider.label} as default`}
          disabled={starBlocked}
          className={`transition-colors ${starBlocked ? 'opacity-40 cursor-not-allowed text-light-text-muted dark:text-dark-text-muted' : provider.isDefault ? 'text-amber-500' : 'text-light-text-muted dark:text-dark-text-muted hover:text-amber-500'}`}
          title={starBlocked ? 'Enable this provider before making it the default' : 'Set as default'}
        >
          <Star size={15} />
        </button>
        {confirming ? (
          <div className="flex gap-1">
            <button onClick={remove} className="text-xs text-red-500 font-medium px-2 py-0.5 rounded bg-red-500/10">Confirm</button>
            <button onClick={() => setConfirming(false)} className="text-xs text-light-text-muted dark:text-dark-text-muted px-2 py-0.5 rounded glass-input">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${provider.label}`}
            className="text-light-text-muted dark:text-dark-text-muted hover:text-red-500 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Channel Row ──────────────────────────────────────────────────────────────

function ChannelRow({
  channel,
  status,
  label,
  tokenPlaceholder,
  metadataPlaceholder,
  icon,
  onRefresh,
}: {
  channel: 'INSTAGRAM' | 'LINKEDIN'
  status: ChannelStatus
  label: string
  tokenPlaceholder: string
  metadataPlaceholder: string
  icon: React.ReactNode
  onRefresh: () => void
}) {
  const [token, setToken] = useState('')
  const [metadata, setMetadata] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    setLoading(true)
    try {
      await apiFetch('/api/team/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, token, metadata }),
      })
      setToken(''); setMetadata('')
      onRefresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally { setLoading(false) }
  }

  async function revoke() {
    try {
      await apiFetch(`/api/team/channels/${channel}`, { method: 'DELETE' })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  return (
    <div className="glass-panel rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-light-text-muted dark:text-dark-text-muted">{icon}</span>
          <span className="font-medium text-sm text-light-text dark:text-dark-text">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {status.connected
            ? <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium"><CheckCircle size={13} /> Connected</span>
            : <span className="flex items-center gap-1.5 text-xs text-light-text-muted dark:text-dark-text-muted"><XCircle size={13} /> Not connected</span>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <GlassInput
            type={showToken ? 'text' : 'password'}
            placeholder={tokenPlaceholder}
            value={token}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowToken(v => !v)}
            aria-label={showToken ? 'Hide access token' : 'Show access token'}
            aria-pressed={showToken}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-light-text-muted dark:text-dark-text-muted"
          >
            {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <GlassInput
          placeholder={metadataPlaceholder}
          value={metadata}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMetadata(e.target.value)}
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={save} disabled={loading || !token || !metadata}>
          {loading ? 'Saving…' : 'Save'}
        </Button>
        {status.connected && (
          <Button variant="secondary" size="sm" onClick={revoke}>Revoke</Button>
        )}
      </div>
    </div>
  )
}

// FR-05: say plainly which IMAGE row serves teammates who have no personal
// OpenAI key. The rule is pickServingImageProvider's, the same one the resolver
// uses, so this text can't disagree with what generation actually does.
function ImageDefaultState({ rows, onRefresh }: { rows: Provider[]; onRefresh: () => void }) {
  const serving = pickServingImageProvider(rows)
  const [busy, setBusy] = useState(false)

  async function makeDefault(id: string) {
    setBusy(true)
    try {
      await apiFetch(`/api/admin/providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  if (!serving) {
    return (
      <div data-testid="image-default-state" data-state="none" role="status" className="rounded-xl border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-3">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No image provider</p>
        <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-1">
          Teammates without a personal OpenAI key get no AI backgrounds.
        </p>
      </div>
    )
  }
  if (serving.isDefault) {
    return (
      <p data-testid="image-default-state" data-state="default" className="text-xs text-light-text-muted dark:text-dark-text-muted">
        Teammates without a personal OpenAI key use this provider.
      </p>
    )
  }
  return (
    <div data-testid="image-default-state" data-state="fallback" role="status" className="rounded-xl border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-center gap-3 flex-wrap">
      <p className="flex-1 min-w-0 text-xs text-amber-800 dark:text-amber-300">
        No default set — teammates are using <span className="font-semibold">{serving.label}</span> (the oldest enabled image provider).
      </p>
      <Button variant="secondary" size="sm" onClick={() => makeDefault(serving.id)} disabled={busy}>
        Make default
      </Button>
    </div>
  )
}

// ─── Section: AI Providers ─────────────────────────────────────────────────────

function ProvidersSection() {
  const queryClient = useQueryClient()
  const [showRegister, setShowRegister] = useState(false)
  // CLI mode resolves copy through `claude -p` on the OAuth chain (personal token
  // → team token), so a COPY provider is not just optional but meaningless there:
  // offering the slot invited teams to register a key that would never be used.
  // API mode still genuinely needs one, so the slot survives when cliMode is off.
  const { cliMode } = useCurrentUser()

  const providersQuery = useQuery({
    queryKey: ['admin-providers'],
    queryFn: () => apiFetch<Provider[]>('/api/admin/providers'),
  })
  const providers = providersQuery.data ?? []

  function invalidateProviders() {
    return queryClient.invalidateQueries({ queryKey: ['admin-providers'] })
  }

  const providersBySlot = (slot: ProviderSlot) => providers.filter(p => p.slot === slot)

  if (providersQuery.isLoading) {
    return <p className="text-sm text-light-text-muted dark:text-dark-text-muted">Loading…</p>
  }
  if (providersQuery.isError) {
    return <QueryError error={providersQuery.error} onRetry={() => providersQuery.refetch()} />
  }

  // In CLI mode COPY is dropped from the UI — but only when the team has no COPY
  // rows. A team that registered one earlier (or carries the legacy `cli`
  // placeholder) must still be able to see and delete it, so an existing row keeps
  // its section rather than becoming invisible and unmanageable.
  const copyRows = providersBySlot('COPY')
  const visibleSlots: ProviderSlot[] =
    cliMode && copyRows.length === 0 ? ['IMAGE'] : ['COPY', 'IMAGE']

  return (
    <div className="space-y-6">
      {cliMode && (
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
          This server runs Claude in CLI mode, so copy is generated on the Claude OAuth chain — a
          member&apos;s personal token, falling back to the team token. No copy provider is needed;
          the only key this team needs is an <span className="font-semibold">image</span> key for
          AI backgrounds.
        </p>
      )}

      {visibleSlots.map(slot => (
        <div key={slot} className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
              {slot === 'COPY' ? 'Copy (text generation)' : 'Image generation'}
            </h3>
          </div>
          {slot === 'COPY' && cliMode && (
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted italic">
              Not used in CLI mode — safe to delete.
            </p>
          )}
          {slot === 'IMAGE' && <ImageDefaultState rows={providersBySlot('IMAGE')} onRefresh={invalidateProviders} />}
          {providersBySlot(slot).length === 0 && (
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted italic">No providers registered for {slot}</p>
          )}
          {providersBySlot(slot).map(p => (
            <ProviderCard key={p.id} provider={p} onRefresh={invalidateProviders} />
          ))}
        </div>
      ))}

      {showRegister ? (
        <RegisterForm
          allowCopySlot={!cliMode}
          onSuccess={() => { setShowRegister(false); invalidateProviders() }}
        />
      ) : (
        <Button variant="secondary" onClick={() => setShowRegister(true)} className="flex items-center gap-2">
          <Plus size={15} /> {cliMode ? 'Register image key' : 'Register Provider'}
        </Button>
      )}
    </div>
  )
}

// ─── Section: Social Channels ───────────────────────────────────────────────────

function ChannelsSection() {
  const queryClient = useQueryClient()

  const channelsQuery = useQuery({
    queryKey: ['team-channels'],
    queryFn: () => apiFetch<ChannelMap>('/api/team/channels'),
  })
  const channels = channelsQuery.data ?? { INSTAGRAM: { connected: false }, LINKEDIN: { connected: false } }

  function invalidateChannels() {
    return queryClient.invalidateQueries({ queryKey: ['team-channels'] })
  }

  if (channelsQuery.isLoading) {
    return <p className="text-sm text-light-text-muted dark:text-dark-text-muted">Loading…</p>
  }
  if (channelsQuery.isError) {
    return <QueryError error={channelsQuery.error} onRetry={() => channelsQuery.refetch()} />
  }

  return (
    <div className="space-y-4">
      <ChannelRow
        channel="INSTAGRAM"
        status={channels.INSTAGRAM}
        label="Instagram"
        tokenPlaceholder="Access token"
        metadataPlaceholder="Business Account ID"
        icon={<InstagramIcon size={18} />}
        onRefresh={invalidateChannels}
      />
      <ChannelRow
        channel="LINKEDIN"
        status={channels.LINKEDIN}
        label="LinkedIn"
        tokenPlaceholder="Access token"
        metadataPlaceholder="Organization ID"
        icon={<LinkedinIcon size={18} />}
        onRefresh={invalidateChannels}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const { isTeamAdmin, isLoading } = useCurrentUser()

  if (isLoading) return null

  if (!isTeamAdmin) {
    return (
      <GlassPanel className="p-12 text-center max-w-md mx-auto mt-12">
        <ShieldAlert size={32} className="mx-auto mb-3 text-light-text-muted dark:text-dark-text-muted" />
        <h1 className="text-lg font-semibold text-light-text dark:text-dark-text mb-1">
          Requires team admin
        </h1>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
          Team settings are limited to this team&apos;s administrators.
        </p>
      </GlassPanel>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Team settings</h1>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-1">
          Providers, channels, and credentials shared by everyone on this team.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">AI Providers</h2>
        <ProvidersSection />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Social Channels</h2>
        <ChannelsSection />
      </section>

      <section>
        <TeamClaudeTokenCard />
      </section>

      <section>
        <ApiKeysCard />
      </section>
    </div>
  )
}
