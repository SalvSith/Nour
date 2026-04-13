# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✓         |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a vulnerability — for example, a way to extract a user's conversation history, abuse the emotion endpoint, or execute code — please report it privately:

1. Open a [GitHub Security Advisory](https://github.com/SalvSith/Nour/security/advisories/new) on this repository.
2. Include a clear description of the issue, steps to reproduce, and the potential impact.

You can expect an acknowledgement within **48 hours** and a resolution timeline within **7 days** for critical issues.

## Scope

The main areas of concern for this project:

- **Emotion API endpoint** — the Supabase Edge Function is intentionally public (no JWT verification). It is protected only by Groq billing limits and Supabase project rate limits. If you find a way to bypass these or amplify requests abusively, please report it.
- **Audio data handling** — audio blobs are transcribed and discarded server-side; they are never stored. Any deviation from this would be a serious issue.
- **localStorage contents** — trauma/memory state is stored client-side only and is not transmitted beyond the emotion payload history. Any cross-origin exposure would be reportable.

## Out of Scope

- Intentional design decisions (e.g. permadeath, no reset button, public emotion endpoint)
- Rate limiting via external platforms (Groq, Supabase) — report to those vendors directly
- Issues requiring physical access to a user's device
