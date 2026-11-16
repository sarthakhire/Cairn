# What does not work (honest list)

This list is written to match the live product. Nothing here is hidden.

## Hosting
- The server runs on a free tier and sleeps after 15 minutes. The first request can take up to a minute. The app shows a wake-up message [CHECK: delete this sentence if the wake-up screen is not live].
- All judges share one database. Changes made by one user are visible to others.

## Verification
- Claims are derived by an LLM and always need human review.
- The fuzzy match threshold was calibrated on a small synthetic set, not on real company data.
- The planted claims used to demonstrate mismatches are synthetic.
- A fuzzy match can never be marked verified. Only an exact match plus a passing support check can.
- Edited statements are not re-verified. Evidence is checked against the original wording.

## Privacy
- During extraction, restricted text is sent to the configured hosted LLM. Uploaded team and lead-only text is masked before storage, restricted text is not masked.
- Demo data is synthetic. Nothing real is stored.

## Review and approval
- Old approved versions made before Round 3 have no verification data until the lead approves again. The UI shows them without a badge.
- One reviewer only. There is no multi-reviewer approval.

## Not built
List only what is really missing, one line each with the reason (time):
- CSV export of the audit trail [CHECK: keep only if not live]
- Bulk accept [CHECK: keep only if not live]
- Preview as an incoming role [CHECK: keep only if not live]
- Audit filters and paging [CHECK: keep only if not live]
- Layout and keyboard pass is partial [CHECK]