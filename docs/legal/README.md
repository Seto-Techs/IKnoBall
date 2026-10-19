# Legal documents

| Document         | Source                                                | Served at  |
| ---------------- | ----------------------------------------------------- | ---------- |
| Terms of Service | `apps/frontend/src/content/legal/terms-of-service.md` | `/terms`   |
| Privacy Policy   | `apps/frontend/src/content/legal/privacy-policy.md`   | `/privacy` |

Markdown, rendered by `apps/frontend/src/components/legal/LegalPage.tsx`. One copy, no HTML
duplicate to drift.

## How much of this actually matters

**The Privacy Policy is a legal requirement.** UU 27/2022 (PDP Law) art. 21 obliges a controller to
tell data subjects who it is, why it processes their data, on what legal basis, what it collects,
how long it keeps it, and what rights they have — before or when it collects the data. Art. 22 then
makes consent given without adequate prior information **void**. So without a notice there is
arguably no lawful basis for holding an email address at all. Art. 57 sanctions run from written
warnings through suspension of processing and deletion orders to fines of up to 2% of revenue.
This document is not optional, and it is already written.

**The Terms of Service is not required by any Indonesian statute.** It earns its place as the
**rulebook**: it states when picks close, what happens to postponed games, that points are worth
nothing, that one account per person, and that scraping is not allowed. That matters operationally
— you need a stated basis to void a pick or close an account, and a stated answer when someone
insists their points have value.

**What the Terms do not do.** They do not stop Komdigi treating the product as gambling, and they do
not bind the NBA over the odds feed. Those are product and sourcing questions, not drafting ones.

Both documents are deliberately short and plain. They were **not drafted or reviewed by a lawyer** —
that is a real limitation, not a technicality. They are written to be honest and readable rather
than to look impressive, because a 200-line agreement full of indemnity and force-majeure clauses
that nobody has reviewed protects you no better than a clear 12-section one, and is harder to keep
accurate.

## Publishing state

Both fields are filled: contact **rakaiseto@gmail.com**, effective **21 October 2026**. No
placeholders remain, so the in-app "not ready to publish" banner no longer appears.

If either needs to change later, edit the Markdown directly — the banner reappears automatically
whenever a `{{TOKEN}}` is left in the text, so a half-edited document cannot ship quietly.

| Field          | Value                 | Source                                           |
| -------------- | --------------------- | ------------------------------------------------ |
| Contact        | `rakaiseto@gmail.com` | Also the address on the email templates' footer  |
| Effective date | 21 October 2026       | Date version 1.0 takes effect                    |
| Operator       | SETO Tech             | Matches the copyright line in the email template |

A personal inbox is fine at this scale, but it is now public on two pages and will be scraped.
Under PDP Law art. 21 it is the official contact for data-protection matters, so it has to stay
monitored. If it ever goes quiet, move to a dedicated address (`legal@` or `privacy@` on the
domain), bump the version, and update both documents.

## Before launch

1. **Indonesian-language version.** An agreement governed by Indonesian law should be available in
   Indonesian (UU 24/2009 art. 31), and consent that isn't available in Indonesian is fragile under
   art. 20 of the PDP Law. A translation is the single highest-value thing left; machine translation
   reviewed by a native speaker is better than nothing, and far better than English only.
2. **PSE registration.** A private-scope electronic system operator serving Indonesian users must
   register with Komdigi (pse.komdigi.go.id, through OSS). This is separate from PDP compliance,
   and Komdigi blocks unregistered operators.
3. **Record acceptance.** Nothing currently stores which version of the terms a user accepted, or
   when. Add `termsVersion` / `termsAcceptedAt` to the users table and set them at sign-up. This is
   worth more than any wording change: terms you can't show a user agreed to are hard to rely on.
4. **Age confirmation.** Both documents say 18+. There's no age check at sign-up. At minimum, a
   required checkbox that is recorded alongside the acceptance above — a client-side-only checkbox
   is theatre.
5. **Be able to honour the Privacy Policy.** It promises access, correction, and erasure. Today
   those are handled by hand over email, which is fine at small scale — but know the queries, and
   make sure deletion actually cascades through picks and sessions.

## The two risks wording cannot remove

**1. Gambling classification.** Komdigi blocked Polymarket as online gambling in May 2026, and it's
a prediction product with odds. What keeps IKnoBall outside that is the design: no stake, no
deposit, no cash-out, points that cannot be redeemed, no prizes, no affiliate links to bookmakers.
If any of those change — an entry fee, a cash prize, redeemable points, a "bet now" call to action —
these documents will not save it. Keep points non-redeemable and keep betting CTAs away from the
odds display.

**2. The odds feed.** The app reads `cdn.nba.com`'s odds file with browser-shaped headers, from an
undocumented endpoint with no terms permitting redistribution. A disclaimer binds your users, not
the NBA or the bookmakers. This is upstream compliance, not drafting: if the product grows, move to
a licensed feed — the `OddsProvider` seam in `packages/predictions` exists for exactly that.

For how odds, locking, and settlement actually behave — which is what sections 3 and 5 of the Terms
describe — see `docs/prediction-scoring.md`.
