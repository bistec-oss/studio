export class PublishError extends Error {
  constructor(
    public channel: "INSTAGRAM" | "LINKEDIN",
    public reason: string,
  ) {
    super(`[${channel}] ${reason}`)
    this.name = "PublishError"
  }
}
