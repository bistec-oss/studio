# Proposal: WhatsApp Channel posting and scheduling (assisted)

**Created:** 2026-09-23
**Status:** 🟡 Draft

## Problem

The marketing team wants posts to go out on the company's **WhatsApp Channel** alongside Instagram and LinkedIn, scheduled the same way. Today the product knows exactly two channels (`enum Channel { INSTAGRAM, LINKEDIN }`, `prisma/schema.prisma:46`), and every scheduled post is claimed and auto-published by the job runner (`lib/scheduler/jobRunner.ts`).

**There is no official API for posting to a WhatsApp Channel.** Checked 2026-09-23:

- Meta's WhatsApp Business Platform (Cloud API) sends messages to **individual opted-in users**. It has no endpoint for Channels.
- Channels are posted to by an admin inside the WhatsApp app. Guides for business use state that Channels _"do not support API-driven automation"_.
- The services advertising a "WhatsApp Channels API" (e.g. Whapi.Cloud) are **unofficial**: they drive a logged-in WhatsApp session the way WhatsApp Web does. That breaks WhatsApp's terms and puts the company's number at risk of a ban.

Sources:

- [Meta — WhatsApp Business Platform overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview)
- [Kanal — WhatsApp Channels for Business (2026)](https://getkanal.com/blog/whatsapp-channels-feature-guide)
- [Whapi.Cloud — unofficial Channels API](https://whapi.cloud/whatsapp-channels)

Fully automatic Channel posting therefore cannot be built safely. **The decision (2026-09-23) is assisted posting:** Bistec Studio does everything up to the final tap, and a person makes that tap.

## Proposed Solution

WhatsApp becomes a first-class channel whose publisher **hands off to a person** instead of calling an API.

1. **`WHATSAPP` channel** added to `enum Channel`, selectable in the Publish dialog, the campaign queue post-actions and the scheduler like any other.
2. **A handoff state, not a publish.** New `PostStatus.AWAITING_MANUAL`.
   - When a WhatsApp post comes due, the worker moves it `SCHEDULED → AWAITING_MANUAL` instead of calling a publisher. There are no retries or backoff, because there is nothing to retry.
   - Publish-now goes straight to `AWAITING_MANUAL`.
   - `AWAITING_MANUAL` is added to `LIVE_POST_STATUSES` (`publishDraft.ts:22`), so the duplicate-publish 409 still holds.
3. **"Ready to post" handoff screen**, built mobile-first because the tap happens on a phone:
   - the finished image, and a caption formatted for WhatsApp;
   - **Share** via the Web Share API with the PNG attached, so the user picks WhatsApp → the Channel;
   - fallbacks: **Download image**, **Copy caption**, **Open WhatsApp**;
   - **Mark as posted** (optionally paste the channel post link), which sets `PUBLISHED`, `publishedAt`, and who posted it.
4. **Alerting the poster.** A per-team list of **designated WhatsApp posters** set at `/team`.
   - At due time they are alerted, with an in-app "Ready to post" badge and queue as the always-available baseline.
   - Out-of-app delivery (email, web push, or a WhatsApp message to the poster's own number via the Cloud API) is an open question below. The product has **no notification infrastructure today**.
   - Overdue items (not posted within a configurable window) are flagged and re-alerted, never silently dropped.
5. **A WhatsApp caption variant.** Copy generation currently writes `INSTAGRAM:` / `LINKEDIN:` sections. Add a WhatsApp variant using WhatsApp's own formatting (`*bold*`, `_italic_`, no Markdown `**`). Keep it short, with the link in the body since there is no "link in bio".
6. **`/team` configuration:** the Channel's name and invite link, plus the designated posters. No credential is stored, because none exists. That is a deliberate difference from `ChannelToken`, which assumes an encrypted token.
7. **MCP / ACP parity.** Publish tools accept `WHATSAPP` and return `awaiting_manual` with the handoff link, instead of pretending the post went out.

## Scope

### In Scope

- `WHATSAPP` channel + `AWAITING_MANUAL` status (one migration), wired through the publish service, job runner, campaign queue post-actions, Publish dialog, library and the MCP/ACP publish tools
- Mobile-first handoff screen: Web Share with file, download, copy caption, open WhatsApp, mark as posted
- Designated posters + Channel config at `/team`
- In-app "Ready to post" badge/queue and overdue flagging
- WhatsApp caption variant in the copy prompt (`PROMPT_VERSION` bump)
- Tests: the scheduler hands off (does not publish) a due WhatsApp post; the duplicate guard covers `AWAITING_MANUAL`; mark-as-posted transitions; handoff is team-scoped (cross-team → 404)

### Out of Scope

- Any unofficial or session-automation Channel API (rejected: terms-of-service and ban risk)
- WhatsApp Status posting (no API either)
- Broadcasting to opted-in contacts through the Cloud API as a separate automatic destination. It was considered and **not selected** for this change; it can follow as its own proposal.
- Native mobile apps. The handoff is a responsive web page.
- Channel analytics (followers, views). WhatsApp exposes none via API.

## Dependencies

- **B4 (scheduler resource not running on prod) must be fixed first.** Scheduled WhatsApp handoffs are raised by the worker. With the worker down, a scheduled WhatsApp post would sit in `SCHEDULED` forever, exactly like B4's HOLD entry. Manual "publish now" works without it.
- **006 item 7 (scheduler heartbeat)** is strongly recommended alongside. A missed handoff is a missed post, and it is the same "nothing self-reports" failure B4 was.

## Impact

- **Files affected:** ~15–25 (estimated) — schema + migration, `publishDraft.ts`, `jobRunner.ts`, campaign queue, `PublishDialog.tsx`, library, new handoff page + route, `/team` section, copy prompt, MCP/ACP publish tools, tests
- **Complexity:** medium
- **Risk:** low-medium. No external API and no credentials. The main risks are process ones: the handoff relies on a person acting, so alerting and overdue flagging carry the reliability. The job-runner change must exclude WhatsApp from the auto-publish claim, or it would try (and fail) to publish.

## Open Questions

- **Does WhatsApp's share sheet offer Channels as a destination** on Android and iOS when an image + text is shared from the browser? This must be verified on real devices before the design is final. If not, the fallback flow (download + copy + open WhatsApp) becomes primary.
- **How are posters alerted outside the app?**
  - **Email:** needs SMTP; the simplest option.
  - **Web push:** needs a service worker + VAPID keys, and works best if the app is installed as a PWA.
  - **WhatsApp message to the poster's own number via the Cloud API:** needs a Business number + an approved utility template. It also depends on whether WhatsApp supports forwarding a chat message into a Channel, which is unverified.
- Should a `SCHEDULE_PUBLISH` queue entry that includes WhatsApp still auto-publish its other channels on time, with only the WhatsApp part waiting? (Proposed: yes, and each channel's Post row is independent.)
- What is the overdue window before re-alerting, and does an unposted item ever expire to `CANCELLED`, or stay open until someone acts?
- Is one Channel per team enough, or do teams need several (e.g. Bistec and Hearts Academy under one tenant)?

---

**To proceed:** Review this proposal and approve to begin planning.
