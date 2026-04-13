#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Nour — Supabase one-time setup
#
# What this does:
#   1. Checks the Supabase CLI is installed
#   2. Logs you in (opens browser)
#   3. Asks for your Supabase project reference
#   4. Links this repo to that project
#   5. Sets your GROQ_API_KEY as a function secret
#   6. Deploys the emotion edge function
#   7. Writes VITE_API_URL to .env.local so the frontend hits your function
#
# Usage:
#   chmod +x scripts/setup-supabase.sh
#   ./scripts/setup-supabase.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}→${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}!${NC} $*"; }
die()     { echo -e "${RED}✗${NC} $*"; exit 1; }

echo ""
echo "  ███╗   ██╗ ██████╗ ██╗   ██╗██████╗ "
echo "  ████╗  ██║██╔═══██╗██║   ██║██╔══██╗"
echo "  ██╔██╗ ██║██║   ██║██║   ██║██████╔╝"
echo "  ██║╚██╗██║██║   ██║██║   ██║██╔══██╗"
echo "  ██║ ╚████║╚██████╔╝╚██████╔╝██║  ██║"
echo "  ╚═╝  ╚═══╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝"
echo ""
echo "  Supabase setup script"
echo "  ─────────────────────────────────────"
echo ""

# ── 1. Check Supabase CLI ────────────────────────────────────────────────────
if ! command -v supabase &>/dev/null; then
  die "Supabase CLI not found.\n\n  Install it with:\n    brew install supabase/tap/supabase\n  or:\n    npm install -g supabase\n\n  Then re-run this script."
fi
success "Supabase CLI found ($(supabase --version))"

# ── 2. Log in ────────────────────────────────────────────────────────────────
echo ""
info "Logging in to Supabase (a browser window will open)..."
supabase login
success "Logged in"

# ── 3. Project reference ─────────────────────────────────────────────────────
echo ""
echo "  Your project reference is the random string in your Supabase dashboard URL:"
echo "  https://supabase.com/dashboard/project/<project-ref>"
echo ""
echo "  Don't have a project yet? Create one at https://supabase.com/dashboard"
echo ""
read -rp "  Enter your project reference: " PROJECT_REF

if [[ -z "$PROJECT_REF" ]]; then
  die "Project reference cannot be empty."
fi

# ── 4. Link ──────────────────────────────────────────────────────────────────
echo ""
info "Linking to project $PROJECT_REF..."
supabase link --project-ref "$PROJECT_REF"
success "Linked"

# ── 5. GROQ API key ──────────────────────────────────────────────────────────
echo ""
echo "  You need a Groq API key for Whisper transcription + Llama emotion analysis."
echo "  Get one free at: https://console.groq.com"
echo ""
read -rsp "  Enter your GROQ_API_KEY (input hidden): " GROQ_KEY
echo ""

if [[ -z "$GROQ_KEY" ]]; then
  die "GROQ_API_KEY cannot be empty."
fi

info "Setting GROQ_API_KEY secret..."
supabase secrets set GROQ_API_KEY="$GROQ_KEY"
success "Secret set"

# ── 6. Deploy function ───────────────────────────────────────────────────────
echo ""
info "Deploying emotion edge function..."
supabase functions deploy emotion --no-verify-jwt
success "Edge function deployed"

# ── 7. Write .env.local ──────────────────────────────────────────────────────
FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/emotion"

ENV_FILE=".env.local"
if [[ -f "$ENV_FILE" ]]; then
  # Remove any existing VITE_API_URL line and append the new one
  grep -v "^VITE_API_URL=" "$ENV_FILE" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "$ENV_FILE"
fi

echo "VITE_API_URL=${FUNCTION_URL}" >> "$ENV_FILE"
success "Written VITE_API_URL to $ENV_FILE"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "  ─────────────────────────────────────────────────────────────"
echo ""
success "All done! Your setup:"
echo ""
echo "  Edge function URL:  ${FUNCTION_URL}"
echo "  Local env file:     ${ENV_FILE}"
echo ""
echo "  Start the dev server:"
echo "    npm run dev"
echo ""
echo "  The frontend will automatically call your Supabase edge function."
echo "  For production, set VITE_API_URL in your Vercel project settings:"
echo "    ${FUNCTION_URL}"
echo ""
