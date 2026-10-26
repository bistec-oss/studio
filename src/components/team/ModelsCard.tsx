'use client'

import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { Notice } from '@/components/ui/Notice'
import { QueryError } from '@/components/ui/QueryError'
import { SectionHead } from '@/components/ui/SectionHead'
import { Select } from '@/components/ui/Select'
import { StatusChip } from '@/components/ui/StatusChip'
import { FOCUS, ROW } from '@/components/ui/atoms'
import { apiFetch } from '@/lib/apiFetch'
import { SURFACE_LABELS, USER_SURFACES, isModelKey } from '@/lib/models/catalogue'
import {
  defaultOptions,
  formFromPolicy,
  policyBody,
  toggleAllowed,
  type PolicyForm,
} from '@/lib/models/policyForm'
import type { ModelsView, TeamModelPolicyInfo } from '@/lib/api-types'

// /team → Models (008 FR-14): which Claude models the team may run, a default
// per user surface, and the "Opus requires a personal token" switch. The
// policy's rules live on the server (policyRules.ts validatePolicy); a refused
// save shows the server's message inline. The catalogue rows (tier, speed,
// eligible surfaces) come from GET /api/models, the same view every picker reads.

const POLICY_KEY = ['team', 'model-policy'] as const
const MODELS_KEY = ['models'] as const

const CHECKBOX = `h-4 w-4 accent-accent disabled:cursor-not-allowed ${FOCUS}`

export function ModelsCard() {
  const policyQuery = useQuery({
    queryKey: POLICY_KEY,
    queryFn: () => apiFetch<TeamModelPolicyInfo>('/api/team/model-policy'),
  })
  const modelsQuery = useQuery({
    queryKey: MODELS_KEY,
    queryFn: () => apiFetch<ModelsView>('/api/models'),
  })

  const headingId = React.useId()
  const failed = policyQuery.isError ? policyQuery : modelsQuery.isError ? modelsQuery : null

  return (
    // Named by its heading, so the section is a region the E2E can scope to (its Save is one of several).
    // A bezel card (021 design.md §8), its head the study's .card-hd.
    <section aria-labelledby={headingId} className="surface-bezel min-w-0 p-5">
      <SectionHead title="Models" id={headingId} className="mb-3" />

      <div>
        <p className="text-ui-sm text-fg-muted">
          The Claude models this team can run, and the model each part of the app uses by default.
        </p>

        <div className="mt-4">
          {failed ? (
            <QueryError error={failed.error} onRetry={() => failed.refetch()} />
          ) : !policyQuery.data || !modelsQuery.data ? (
            <p className="text-ui-sm text-fg-muted">Loading…</p>
          ) : (
            // Re-keyed on every fetch, so a saved policy resets the form to what the server holds.
            <ModelsForm
              key={policyQuery.dataUpdatedAt}
              policy={policyQuery.data}
              view={modelsQuery.data}
            />
          )}
        </div>
      </div>
    </section>
  )
}

function ModelsForm({ policy, view }: { policy: TeamModelPolicyInfo; view: ModelsView }) {
  const queryClient = useQueryClient()
  // The models view is already loaded here; /api/me may still be loading.
  const cliMode = view.mode === 'cli'
  const [form, setForm] = useState<PolicyForm>(() => formFromPolicy(policy))
  const allowedId = React.useId()
  const defaultsId = React.useId()
  const gateHelpId = React.useId()
  const idFor = (name: string) => `${allowedId}-${name}`

  const saveMutation = useMutation({
    mutationFn: (f: PolicyForm) =>
      apiFetch<TeamModelPolicyInfo>('/api/team/model-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policyBody(f)),
      }),
    onSuccess: () => {
      toast.success('Models saved')
      queryClient.invalidateQueries({ queryKey: POLICY_KEY })
      queryClient.invalidateQueries({ queryKey: MODELS_KEY })
    },
  })

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        saveMutation.mutate(form)
      }}
    >
      <div>
        <FieldLabel as="span" id={allowedId} className="mb-2">
          Allowed models
        </FieldLabel>
        <div role="group" aria-labelledby={allowedId}>
          <ul className="border-t border-line-subtle">
            {view.catalogue.map((e) => {
              const id = idFor(e.key)
              return (
                <li key={e.key} className={`${ROW} flex flex-wrap items-center gap-x-3 gap-y-1 last:border-b-0`}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={form.allowed.includes(e.key)}
                    onChange={(ev) => setForm((f) => toggleAllowed(f, e.key, ev.target.checked))}
                    className={CHECKBOX}
                  />
                  {/* The checkbox's name is the model line alone; the chip sits outside it. */}
                  <label htmlFor={id} className="cursor-pointer text-ui-base text-fg">
                    {e.displayName} · {e.tier} · {e.speed}
                  </label>
                  {policy.newModels.includes(e.key) && (
                    <StatusChip tone="scheduled">New</StatusChip>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <div>
        <FieldLabel as="span" id={defaultsId} className="mb-2">
          Defaults
        </FieldLabel>
        <div role="group" aria-labelledby={defaultsId} className="grid gap-4 sm:grid-cols-2">
          {USER_SURFACES.map((surface) => (
            <Select
              key={surface}
              id={idFor(surface)}
              label={SURFACE_LABELS[surface].name}
              options={defaultOptions(surface, form, view)}
              value={form.defaults[surface] ?? ''}
              onChange={(ev) => {
                const value = ev.target.value
                setForm((f) => ({
                  ...f,
                  defaults: { ...f.defaults, [surface]: isModelKey(value) ? value : null },
                }))
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <input
          id={idFor('gate')}
          type="checkbox"
          checked={form.gateOn}
          disabled={!cliMode}
          aria-describedby={gateHelpId}
          onChange={(ev) => setForm((f) => ({ ...f, gateOn: ev.target.checked }))}
          className={`mt-1 ${CHECKBOX}`}
        />
        <div className="min-w-0">
          <label
            htmlFor={idFor('gate')}
            className={`text-ui-base text-fg ${cliMode ? 'cursor-pointer' : 'cursor-not-allowed'}`}
          >
            Opus requires a personal token
          </label>
          <div id={gateHelpId} className="mt-1 text-ui-xs text-fg-muted">
            <p>
              Runs that would use the team&apos;s Claude token can&apos;t use Opus. Scheduled posts,
              MCP and ACP always use the team token.
            </p>
            {!cliMode && <p className="mt-1">Only applies in CLI mode.</p>}
          </div>
        </div>
      </div>

      {saveMutation.isError && (
        <Notice tone="error" role="alert" data-testid="models-save-error">
          {saveMutation.error.message}
        </Notice>
      )}

      <div>
        <Button type="submit" variant="ink" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
