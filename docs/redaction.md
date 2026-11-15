# Redaction and sensitive text

This page says what Cairn masks, what it does not, and where sensitive text can go. Everything in the tables was checked by running the real `redact` function, and the rules are covered by `server/tests/redaction-boundary.test.js`.

## The decision

| Source label | At upload | Stored as | Read by the AI model |
|---|---|---|---|
| team | Credentials, emails and phone numbers are masked | Masked text only | Yes (the masked text) |
| lead_only | Same masking | Masked text only | Yes (the masked text) |
| restricted | Nothing is masked | As written | Yes, unless `EXTRACT_RESTRICTED=false` |

Why restricted is not masked: restricted sources are where secrets belong. The demo plants fake credentials there on purpose, so the permission gate can be shown hiding them from incoming roles. They are reviewer-only, and incoming roles only ever get a placeholder with no text and no evidence.

The original text of a team or lead-only source is never stored. Only the masked copy exists, so it cannot be recovered later.

## What is masked

Password, passwd, pwd, passcode, secret, api key, access key and token, when followed by `:`, `=` or the word "is". Tokens shaped like `sk-...`, `ghp_...`, `gho_...` and `AKIA...`. Email addresses. Phone numbers written as 10 digits (with or without +91 style prefix, one optional space or dash in the middle) and as 3-3-4 groups. The author or owner field is masked too.

## What is NOT masked (checked, so these are real limits)

| Example | Result |
|---|---|
| `secret_key=abcd1234` | not masked |
| `token abcd1234` (no `:`, `=` or "is") | not masked |
| `pass: hunter2` | not masked |
| `Authorization: Bearer eyJ...` (JWT) | not masked |
| `-----BEGIN PRIVATE KEY-----` blocks | not masked |
| `98 76 54 32 10` (phone with odd spacing) | not masked |
| Aadhaar-style `1234 5678 9012` | not masked |
| PAN-style `ABCDE1234F` | not masked |
| Card-style `4111 1111 1111 1111` | not masked |
| Names, addresses, free-text secrets | not masked |

A connection string such as `mongodb+srv://admin:Pa55word@host/db` is masked only by accident: the email rule removes `Pa55word@cluster...`, leaving `admin:[REDACTED]/db`.

Redaction is a safety net, not a guarantee. Label sources honestly. Anything that should never reach a hosted model belongs in a restricted source with extraction of restricted sources switched off.

## Where sensitive text can go

- Database: team and lead-only text is stored masked. Restricted text is stored as written.
- Upload response and audit lines: counts only, never text (tested for all three file types).
- API for incoming roles: restricted claims are placeholders. Drafts and rejected claims are not visible. Reviewer-only fields (original wording, reasons, history) are not sent.
- Hosted AI model: during extraction the model receives the stored text. For team and lead-only that is the masked text. For restricted it is the raw text, unless `EXTRACT_RESTRICTED=false`, in which case the restricted tier is not read at all and nothing from it is sent.

## The setting

`EXTRACT_RESTRICTED` (server environment variable). Default is on. Only the exact value `false` turns it off. Existing restricted claims are not touched when it is off, but no new restricted claims are created from new text.

For the live demo it stays on, so the planted fake credentials are extracted and the permission gate can be shown. The credentials are synthetic. Do not upload real secrets to a restricted source while it is on.

## Third-party terms

Hosted model providers have their own terms about how submitted text is used. This has not been checked for the provider configured here. Check the provider's current terms before sending anything real.
