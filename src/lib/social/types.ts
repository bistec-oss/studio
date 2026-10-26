import type { Channel } from "@prisma/client"

// `terminal` marks a refusal that retrying can't fix (e.g. a channel with no
// publisher): the scheduler fails the post outright instead of retrying it.
export class PublishError extends Error {
  public terminal: boolean

  constructor(
    public channel: Channel,
    public reason: string,
    opts: { terminal?: boolean } = {},
  ) {
    super(`[${channel}] ${reason}`)
    this.name = "PublishError"
    this.terminal = opts.terminal ?? false
  }
}
