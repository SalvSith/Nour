# Contributing to Nour

Thanks for your interest in this project.

## Run it locally

Setup, prerequisites, environment variables, and deployment are documented in the [README](README.md). Start with **Getting Started** there (Supabase path or local Node server).

## Branches and pull requests

- **`main`** is the integration branch; keep it releasable.
- **Branch from `main`** for changes. Use short, descriptive branch names (e.g. `fix/audio-timeout`, `chore/dependabot-config`).
- **Open a PR into `main`** when your change is ready for review.
- **Describe what changed and why** in the PR. Link an issue if one exists.
- **Test locally** before requesting review: at minimum `npm run build` for the frontend; if you touched the server, run the dev stack and exercise the emotion flow.

## Secrets and credentials

**Do not commit secrets.** No API keys, tokens, `.env` files, or private URLs that embed credentials. Use environment variables and keep local-only files out of git (see `.gitignore`). If something sensitive was ever committed, rotate the credential and use history cleanup only with care and team agreement.

## Product tone and experience

Nour is a deliberate experience (voice, emotion, permanence, and narrative). **Please do not open PRs that change product tone, core UX, or story beats without discussing the direction first** (e.g. in an issue). Bug fixes, docs, performance, accessibility, and refactors that preserve intent are welcome.

## Questions

Open an issue for larger questions or ambiguous changes; small fixes can go straight to a PR with a clear description.
