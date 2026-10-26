'use client'

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { FOCUS, ICON, ICON_BUTTON, TEXT_LINK } from '@/components/ui/atoms'

// Step-by-step "install Claude Code and get a token" walkthrough, shared by the
// personal (/settings) and team (/team) Claude cards. Commands mirror
// docs/claude-account-setup.md verbatim — change them in both places.

type OsKey = 'windows' | 'macos' | 'linux'

interface Step {
  text: string
  command?: string
  note?: string
  alt?: { text: string; command: string }
}

const OS_LABELS: Record<OsKey, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' }
const OS_ORDER: OsKey[] = ['windows', 'macos', 'linux']

const LINUX_DOCS_URL = 'https://code.claude.com/docs/en/setup#install-claude-code'

// The one place the per-OS steps live.
const FINISH_STEPS: Step[] = [
  { text: 'Open a new terminal window so the install is picked up.' },
  { text: 'Run this command and sign in with your Claude account in the browser window it opens.', command: 'claude setup-token' },
  { text: 'Copy the printed token. It starts with sk-ant-oat01- and lasts about a year.' },
]

const STEPS: Record<OsKey, Step[]> = {
  windows: [
    {
      text: 'Open PowerShell (Win+X, then pick PowerShell) and run the installer.',
      command: 'irm https://claude.ai/install.ps1 | iex',
      alt: {
        text: 'Alternative: winget. A winget install can be missing from winget list and may not upgrade or uninstall cleanly (winget-cli#6200), so prefer the installer above.',
        command: 'winget install Anthropic.ClaudeCode',
      },
    },
    ...FINISH_STEPS,
  ],
  macos: [
    {
      text: 'Open Terminal (Cmd+Space, type Terminal) and run the installer.',
      command: 'curl -fsSL https://claude.ai/install.sh | bash',
    },
    ...FINISH_STEPS,
  ],
  linux: [
    {
      text: 'Install Claude Code by following Anthropic’s instructions for Linux.',
      note: LINUX_DOCS_URL,
    },
    ...FINISH_STEPS,
  ],
}

function detectOs(): OsKey {
  if (typeof navigator === 'undefined') return 'windows'
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const p = (nav.userAgentData?.platform ?? nav.platform ?? '').toLowerCase()
  if (p.includes('mac') || p.includes('iphone') || p.includes('ipad')) return 'macos'
  if (p.includes('linux') || p.includes('x11') || p.includes('android')) return 'linux'
  return 'windows'
}

function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked (insecure origin); the text stays selectable.
    }
  }

  // A code line (§5.1: mono is for code only) in a recessed canvas well with a
  // hairline ring. The command wraps rather than scrolling, so nothing here
  // needs a keyboard scroll region and nothing widens the page at 375 px.
  return (
    <span className="mt-1.5 flex items-center gap-2 rounded-ui-md bg-canvas py-1 pl-3 pr-1 ring-1 ring-inset ring-line-subtle">
      <code className="min-w-0 flex-1 font-mono text-ui-xs text-fg [overflow-wrap:anywhere]">
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy command"
        className={`${ICON_BUTTON} hover:bg-surface-raised hover:text-fg ${FOCUS}`}
      >
        {copied ? <Check {...ICON} /> : <Copy {...ICON} />}
      </button>
    </span>
  )
}

export function ClaudeConnectGuide({ variant }: { variant: 'personal' | 'team' }) {
  // Start from Windows and switch after mount so server and client markup match.
  const [os, setOs] = useState<OsKey>('windows')
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOs(detectOs())
  }, [])

  const steps = STEPS[os]

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Operating system"
        // SegmentedToggle's track (§8.4, the study's .theme-btn): a canvas pill
        // with a hairline ring. Drawn here rather than through SegmentedToggle
        // because each tab carries its own id and aria-controls.
        className="inline-flex items-center gap-0.5 self-start rounded-ui-pill bg-canvas p-[3px] ring-1 ring-inset ring-line-subtle"
      >
        {OS_ORDER.map((key) => {
          const selected = key === os
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`claude-guide-tab-${variant}-${key}`}
              aria-selected={selected}
              aria-controls={`claude-guide-panel-${variant}`}
              onClick={() => setOs(key)}
              // Segments in --fg-muted; the selected one raised on the track.
              // Nothing clips the track, so the focus outline sits outside.
              className={`rounded-ui-pill px-3 py-1.5 text-ui-xs font-semibold transition-[background-color,color,box-shadow] duration-fast ease-standard ${FOCUS} ${
                selected ? 'bg-surface-raised text-fg shadow-panel' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {OS_LABELS[key]}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`claude-guide-panel-${variant}`}
        aria-labelledby={`claude-guide-tab-${variant}-${os}`}
      >
        <ol className="flex list-outside list-decimal flex-col gap-2.5 pl-5 text-ui-sm text-fg marker:text-fg-muted">
          {steps.map((step, i) => (
            <li key={i}>
              {step.text}
              {step.note && (
                <>
                  {' '}
                  <a
                    href={step.note}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`break-all rounded-ui-sm ${TEXT_LINK} ${FOCUS}`}
                  >
                    {step.note}
                  </a>
                </>
              )}
              {step.command && <CommandLine command={step.command} />}
              {step.alt && (
                <span className="mt-2 block">
                  {step.alt.text}
                  <CommandLine command={step.alt.command} />
                </span>
              )}
            </li>
          ))}
          <li>
            {variant === 'team'
              ? 'Paste it below. It becomes the team’s fallback for members without their own token, and the only credential for scheduled posts, MCP and ACP.'
              : 'Paste it below.'}
          </li>
        </ol>
      </div>

      <p className="text-ui-xs text-fg-muted">
        A paid Claude plan (Pro, Max, Team or Enterprise) is needed. The free plan does not work.
      </p>
    </div>
  )
}
