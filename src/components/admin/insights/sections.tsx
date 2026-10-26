import React from 'react'
import { Notice } from '@/components/ui/Notice'
import { StatusChip } from '@/components/ui/StatusChip'
import type { Insights } from '@/lib/analytics/queries'
import { DataTable, type Column } from './DataTable'
import { Block, InsightSection, Stat } from './InsightSection'
import { RateBar } from './RateBar'
import { dateTime, dim, ms, num, pct } from './format'

type Refine = Insights['refine']
type Failures = Insights['failures']

// ── 1. Did 004 work ────────────────────────────────────────────────────────

export function RefineSection({ data }: { data: Refine }) {
  const { overall } = data
  const classCols: Column<Refine['byClass'][number]>[] = [
    { key: 'class', header: 'Instruction class', cell: (r) => r.class },
    { key: 'ok', header: 'Applied', align: 'right', cell: (r) => r.ok },
    { key: 'na', header: 'Not applied', align: 'right', cell: (r) => r.notApplied },
    { key: 'rate', header: 'Applied rate', align: 'right', cell: (r) => <RateBar rate={r.appliedRate} testId={`refine-class-rate-${r.class}`} /> },
  ]
  const weekCols: Column<Refine['byWeek'][number]>[] = [
    { key: 'week', header: 'Week of', cell: (r) => r.week },
    { key: 'vm', header: 'Verifier model', cell: (r) => dim(r.verifierModelId) },
    { key: 'vv', header: 'Verifier prompt', cell: (r) => dim(r.verifierPromptVersion) },
    { key: 'ok', header: 'Applied', align: 'right', cell: (r) => r.ok },
    { key: 'na', header: 'Not applied', align: 'right', cell: (r) => r.notApplied },
    { key: 'cf', header: 'Conflict', align: 'right', cell: (r) => r.conflict },
    { key: 'fl', header: 'Failed', align: 'right', cell: (r) => r.failed },
    { key: 'rate', header: 'Applied rate', align: 'right', cell: (r) => <RateBar rate={r.appliedRate} testId={`refine-week-rate-${r.week}-${r.verifierModelId ?? 'none'}`} /> },
  ]
  return (
    <InsightSection
      id="refine"
      title="Did refine work"
      question="How often a refine instruction is applied, by instruction class, week and verifier. Applied rate = applied ÷ (applied + not applied); conflicts and failures are counted beside it."
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Applied rate" value={pct(overall.appliedRate)} testId="refine-overall-rate" />
        <Stat label="Applied" value={overall.ok} testId="refine-overall-ok" />
        <Stat label="Not applied" value={overall.notApplied} testId="refine-overall-not-applied" />
        <Stat label="Conflict or failed" value={overall.conflict + overall.failed} testId="refine-overall-other" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Overrides" value={data.revisions.override} testId="refine-override" />
        <Stat label="Adopted" value={data.revisions.adopted} testId="refine-adopted" />
        <Stat label="Restores" value={data.revisions.restored} testId="refine-restored" />
        <Stat label="Inline edits" value={data.revisions.edited} testId="refine-edited" />
      </div>
      <Block title="By instruction class">
        <DataTable label="Applied rate by instruction class" columns={classCols} rows={data.byClass} rowKey={(r) => r.class} rowTestId={(r) => `refine-class-${r.class}`} minWidth={440} />
      </Block>
      <Block title="By week and verifier">
        <DataTable label="Applied rate by week and verifier" columns={weekCols} rows={data.byWeek} rowKey={(r) => `${r.week}|${r.verifierModelId}|${r.verifierPromptVersion}`} minWidth={760} />
      </Block>
    </InsightSection>
  )
}

// ── 2. Catch regressions ───────────────────────────────────────────────────

export function FailuresSection({ data }: { data: Failures }) {
  const dailyCols: Column<Failures['daily'][number]>[] = [
    { key: 'day', header: 'Day', cell: (r) => r.day },
    { key: 'kind', header: 'Surface', cell: (r) => (r.kind === 'generation' ? 'Generation' : 'Draft actions') },
    { key: 'total', header: 'Total', align: 'right', cell: (r) => r.total },
    { key: 'failed', header: 'Failed', align: 'right', cell: (r) => r.failed },
    { key: 'rate', header: 'Failure rate', align: 'right', cell: (r) => <RateBar rate={r.failureRate} /> },
  ]
  const versionCols: Column<Failures['byPromptVersion'][number]>[] = [
    { key: 'v', header: 'Prompt version', cell: (r) => dim(r.promptVersion) },
    { key: 'total', header: 'Generations', align: 'right', cell: (r) => r.total },
    { key: 'failed', header: 'Failed', align: 'right', cell: (r) => r.failed },
    { key: 'rate', header: 'Failure rate', align: 'right', cell: (r) => <RateBar rate={r.failureRate} /> },
  ]
  const modelCols: Column<Failures['byDesignModel'][number]>[] = [
    { key: 'm', header: 'Design model', cell: (r) => dim(r.model) },
    { key: 'total', header: 'Generations', align: 'right', cell: (r) => r.total },
    { key: 'failed', header: 'Failed', align: 'right', cell: (r) => r.failed },
    { key: 'rate', header: 'Failure rate', align: 'right', cell: (r) => <RateBar rate={r.failureRate} /> },
  ]
  const reasonCols: Column<Failures['topReasons'][number]>[] = [
    { key: 'reason', header: 'Failure reason', cell: (r) => <span className="break-words">{r.reason}</span> },
    { key: 'n', header: 'Count', align: 'right', cell: (r) => r.n },
  ]
  return (
    <InsightSection
      id="failures"
      title="Catch regressions"
      question="Generation and draft-action failures per day, by prompt version and design model, and the reasons behind them."
    >
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Generations swept as stuck" value={data.swept.generation} testId="swept-generation" />
        <Stat label="Actions swept as stuck" value={data.swept.action} testId="swept-action" />
      </div>
      <Block title="Per day">
        <DataTable label="Failure rate per day" columns={dailyCols} rows={data.daily} rowKey={(r) => `${r.day}|${r.kind}`} rowTestId={(r) => `failure-day-${r.day}-${r.kind}`} minWidth={440} />
      </Block>
      <Block title="By prompt version">
        <DataTable label="Failure rate by prompt version" columns={versionCols} rows={data.byPromptVersion} rowKey={(r) => String(r.promptVersion)} rowTestId={(r) => `failure-version-${r.promptVersion ?? 'none'}`} minWidth={420} />
      </Block>
      <Block title="By design model">
        <DataTable label="Failure rate by design model" columns={modelCols} rows={data.byDesignModel} rowKey={(r) => String(r.model)} rowTestId={(r) => `failure-model-${r.model ?? 'none'}`} minWidth={420} />
      </Block>
      <Block title="Top failure reasons">
        <DataTable label="Top failure reasons" columns={reasonCols} rows={data.topReasons} rowKey={(r) => r.reason} rowTestId={(r) => `failure-reason-${r.reason}`} minWidth={360} empty="No failures in this range." />
      </Block>
    </InsightSection>
  )
}

// ── 3. Image styles ────────────────────────────────────────────────────────

export function StylesSection({ data }: { data: Insights['styles'] }) {
  const cols: Column<Insights['styles'][number]>[] = [
    { key: 'style', header: 'Requested style', cell: (r) => r.style },
    { key: 'gen', header: 'Generations', align: 'right', cell: (r) => r.generations },
    { key: 'ok', header: 'Succeeded', align: 'right', cell: (r) => r.okGenerations },
    { key: 'app', header: 'Applied as requested', align: 'right', cell: (r) => <RateBar rate={r.appliedRate} testId={`style-rate-${r.style}`} /> },
    { key: 'ref', header: 'Mean refines per draft', align: 'right', cell: (r) => num(r.meanRefines, 2) },
    {
      key: 'fb',
      header: 'Fallback reasons',
      cell: (r) => (r.fallbacks.length === 0 ? '–' : r.fallbacks.map((f) => `${f.reason} (${f.n})`).join(', ')),
    },
  ]
  return (
    <InsightSection
      id="styles"
      title="Image styles"
      question="How each hero image style behaves on real traffic: how often it holds, why it falls back, and how much it is refined."
    >
      <DataTable label="Image styles" columns={cols} rows={data} rowKey={(r) => r.style} rowTestId={(r) => `style-${r.style}`} minWidth={720} />
    </InsightSection>
  )
}

// ── 3b. Post styles ────────────────────────────────────────────────────────

export function PostStylesSection({ data }: { data: Insights['postStyles'] }) {
  const cols: Column<Insights['postStyles'][number]>[] = [
    { key: 'style', header: 'Post style', cell: (r) => r.label },
    { key: 'chosen', header: 'Chosen', align: 'right', cell: (r) => r.chosen },
    { key: 'gen', header: 'Generations', align: 'right', cell: (r) => r.generations },
    { key: 'flagged', header: 'Flagged', align: 'right', cell: (r) => r.flagged },
    { key: 'rate', header: 'Flag rate', align: 'right', cell: (r) => <RateBar rate={r.flagRate} testId={`post-style-rate-${r.style}`} /> },
    { key: 'held', header: 'Held', align: 'right', cell: (r) => r.held },
  ]
  return (
    <InsightSection
      id="post-styles"
      title="Post styles"
      question="Which post styles people pick, how often the facts check flags a generation, and how many scheduled posts it held. Flag rate = flagged ÷ generations; chosen counts wizard briefs."
    >
      <DataTable label="Post styles" columns={cols} rows={data} rowKey={(r) => r.style} rowTestId={(r) => `post-style-${r.style}`} minWidth={600} />
    </InsightSection>
  )
}

// ── 4. Model and route choices ─────────────────────────────────────────────

export function DurationsSection({ data }: { data: Insights['durations'] }) {
  const cols: Column<Insights['durations'][number]>[] = [
    { key: 's', header: 'Surface', cell: (r) => r.surface.toLowerCase() },
    { key: 'm', header: 'Model', cell: (r) => dim(r.model) },
    { key: 'r', header: 'Caption route', cell: (r) => (r.route ? r.route : '–') },
    { key: 'n', header: 'Runs', align: 'right', cell: (r) => r.n },
    { key: 'p50', header: 'p50', align: 'right', cell: (r) => ms(r.p50) },
    { key: 'p90', header: 'p90', align: 'right', cell: (r) => ms(r.p90) },
    { key: 'tin', header: 'Input tokens', align: 'right', cell: (r) => (r.notReported >= r.n ? '–' : r.inputTokens.toLocaleString('en-US')) },
    { key: 'tout', header: 'Output tokens', align: 'right', cell: (r) => (r.notReported >= r.n ? '–' : r.outputTokens.toLocaleString('en-US')) },
    { key: 'nr', header: 'Not reported', align: 'right', cell: (r) => `${Math.round((r.notReported / r.n) * 100)}%` },
  ]
  return (
    <InsightSection
      id="durations"
      title="Model and route choices"
      question="How long each surface takes by model and caption route, and the tokens it used (successful runs only). Token totals count only runs that reported usage; the Claude CLI route reports none, so its share shows under Not reported."
    >
      <DataTable label="Duration by surface, model and route" columns={cols} rows={data} rowKey={(r) => `${r.surface}|${r.model}|${r.route}`} rowTestId={(r) => `duration-${r.surface}-${r.model ?? 'none'}-${r.route ?? 'none'}`} minWidth={760} />
    </InsightSection>
  )
}

// ── The wizard funnel ──────────────────────────────────────────────────────

const STEP_LABELS = ['Started', 'Size and design', 'Content', 'Images', 'Review']

export function FunnelSection({ data }: { data: Insights['funnel'] }) {
  type Row = { key: string; label: string; n: number; ofStart: number | null }
  const rows: Row[] = [
    ...data.reached.map((r) => ({ key: `step-${r.step}`, label: `Reached: ${STEP_LABELS[r.step] ?? r.step}`, n: r.n, ofStart: r.ofStart })),
    { key: 'submitted', label: 'Submitted (Generate)', n: data.submitted.n, ofStart: data.submitted.ofStart },
    { key: 'submitted-resumed', label: 'Submitted from a resumed brief', n: data.submittedResumed.n, ofStart: null },
  ]
  const cols: Column<Row>[] = [
    { key: 'l', header: 'Stage', cell: (r) => r.label },
    { key: 'n', header: 'Visits', align: 'right', cell: (r) => r.n },
    { key: 'p', header: 'Of started', align: 'right', cell: (r) => <RateBar rate={r.ofStart} testId={`funnel-rate-${r.key}`} /> },
  ]
  return (
    <InsightSection
      id="funnel"
      title="Brief wizard funnel"
      question="Where briefs stop: each step reached once per visit, how many were submitted, and how many were abandoned. A brief draft that expires after 7 days or is discarded without Generate counts as abandoned."
    >
      <DataTable label="Brief wizard funnel" columns={cols} rows={rows} rowKey={(r) => r.key} rowTestId={(r) => `funnel-${r.key}`} minWidth={420} />
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Abandoned: expired" value={data.abandoned.expired} testId="funnel-abandoned-expired" />
        <Stat label="Abandoned: discarded" value={data.abandoned.discarded} testId="funnel-abandoned-discarded" />
      </div>
    </InsightSection>
  )
}

// ── Always: activity, events lost, retention health ────────────────────────

export function TeamsSection({ data }: { data: Insights['teams'] }) {
  const cols: Column<Insights['teams'][number]>[] = [
    { key: 't', header: 'Team', cell: (r) => r.teamName ?? r.teamId },
    { key: 'e', header: 'Events', align: 'right', cell: (r) => r.events },
    { key: 'g', header: 'Generations', align: 'right', cell: (r) => r.generations },
  ]
  return (
    <InsightSection id="teams" title="Activity per team" question="Events and generations per team in the range.">
      <DataTable label="Activity per team" columns={cols} rows={data} rowKey={(r) => r.teamId} rowTestId={(r) => `team-${r.teamId}`} minWidth={360} />
    </InsightSection>
  )
}

export function HealthSection({ lost, retention }: { lost: Insights['lost']; retention: Insights['retention'] }) {
  const lostCols: Column<Insights['lost'][number]>[] = [
    { key: 'n', header: 'Event', cell: (r) => r.name },
    { key: 'd', header: 'Dropped', align: 'right', cell: (r) => r.dropped },
    { key: 'r', header: 'Rejected', align: 'right', cell: (r) => r.rejected },
    { key: 'at', header: 'Last at', cell: (r) => dateTime(r.lastAt) },
    { key: 'why', header: 'Last reason', cell: (r) => <span className="break-words">{r.lastReason}</span> },
  ]
  const totalLost = lost.reduce((a, r) => a + r.dropped + r.rejected, 0)
  const loopChip =
    retention.loop.state === 'online' ? (
      <StatusChip tone="published">Retention running</StatusChip>
    ) : retention.loop.state === 'stale' ? (
      <StatusChip tone="failed">Retention stalled</StatusChip>
    ) : (
      <StatusChip tone="draft">Retention never ran</StatusChip>
    )
  return (
    <InsightSection
      id="health"
      title="Events lost and retention"
      question="Events the store could not keep, and whether the 180-day retention loop is running."
      tail={loopChip}
    >
      {totalLost > 0 && (
        <Notice tone="warning" role="status" data-testid="lost-notice">
          {totalLost} event{totalLost === 1 ? '' : 's'} could not be stored. The figures above undercount by that much.
        </Notice>
      )}
      <Block title="Events lost">
        <DataTable label="Events lost" columns={lostCols} rows={lost} rowKey={(r) => r.name} rowTestId={(r) => `lost-${r.name}`} minWidth={560} empty="No events have been lost." />
      </Block>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Events stored" value={retention.totalEvents} testId="retention-total" />
        <Stat label="Oldest event" value={retention.oldestAgeDays === null ? '–' : `${retention.oldestAgeDays} days`} testId="retention-oldest-age" />
        <Stat label="Retention loop" value={retention.loop.state} testId="retention-loop-state" />
        <Stat label="Last tick" value={dateTime(retention.loop.lastTickAt)} testId="retention-last-tick" />
      </div>
    </InsightSection>
  )
}
