#!/usr/bin/env bash
set -euo pipefail

# Resolve the repository root even when this script is invoked via a symlink
# from ~/.local/bin. This lets the script be run from any project directory.
SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SOURCE" ]]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"

usage() {
  cat <<'EOF'
Start a Pi-to-Pi agent without just.
Can be run from any project directory, including via a symlink in ~/.local/bin.

Usage:
  start-pi2pi.sh [options] [-- extra pi args...]

Options:
  --transport local|net     Use local coms or network coms-net (default: local)
  --model MODEL             Pi model, e.g. openai/gpt-4o
  --provider PROVIDER       Optional Pi provider, e.g. openai
  --thinking LEVEL          off|minimal|low|medium|high|xhigh
  --name NAME               Agent name (recommended)
  --project NAME            Shared project namespace (default: default)
  --purpose TEXT            Agent purpose shown to peers; does not change behavior
  --role-prompt TEXT        Role/persona instruction appended to Pi's system prompt
  --color '#RRGGBB'         Agent color
  --server-url URL          coms-net hub URL (net only)
  --auth-token TOKEN        coms-net bearer token (net only)
  --no-env                  Do not source .env
  --no-ui-extensions        Do not load minimal/theme-cycler
  -h, --help                Show this help

Examples:
  start-pi2pi.sh \
    --transport local \
    --model openai/gpt-4o \
    --name planner \
    --project demo \
    --purpose "Plans the work"

  start-pi2pi.sh \
    --transport net \
    --model anthropic/claude-sonnet-4-5 \
    --name coder \
    --project demo \
    --server-url http://127.0.0.1:52965 \
    --auth-token "$PI_COMS_NET_AUTH_TOKEN"

Notes:
  - Local transport needs only the pi CLI. It does not need just or bun.
  - Network clients need only pi if a coms-net hub already exists.
  - Names like planner/coder are not built in. They are just labels.
  - Use --role-prompt or normal Pi --system-prompt/--append-system-prompt
    after '--' when you want a real behavioral role.
  - Starting the bundled coms-net hub still requires bun because
    scripts/coms-net-server.ts uses Bun.serve.
EOF
}

transport="local"
project="default"
model=""
provider=""
thinking=""
name=""
purpose=""
role_prompt=""
color=""
server_url=""
auth_token=""
load_env=1
load_ui_extensions=1
extra_pi_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --transport)
      transport="${2:-}"; shift 2 ;;
    --model)
      model="${2:-}"; shift 2 ;;
    --provider)
      provider="${2:-}"; shift 2 ;;
    --thinking)
      thinking="${2:-}"; shift 2 ;;
    --name)
      name="${2:-}"; shift 2 ;;
    --project)
      project="${2:-}"; shift 2 ;;
    --purpose)
      purpose="${2:-}"; shift 2 ;;
    --role-prompt)
      role_prompt="${2:-}"; shift 2 ;;
    --color)
      color="${2:-}"; shift 2 ;;
    --server-url)
      server_url="${2:-}"; shift 2 ;;
    --auth-token)
      auth_token="${2:-}"; shift 2 ;;
    --no-env)
      load_env=0; shift ;;
    --no-ui-extensions)
      load_ui_extensions=0; shift ;;
    -h|--help)
      usage; exit 0 ;;
    --)
      shift
      extra_pi_args+=("$@")
      break ;;
    *)
      echo "Unknown option: $1" >&2
      echo >&2
      usage >&2
      exit 2 ;;
  esac
done

if [[ "$transport" != "local" && "$transport" != "net" ]]; then
  echo "Error: --transport must be 'local' or 'net'" >&2
  exit 2
fi

if ! command -v pi >/dev/null 2>&1; then
  echo "Error: pi CLI not found. Install @earendil-works/pi-coding-agent first." >&2
  exit 127
fi

if [[ "$load_env" == "1" && -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

pi_args=()

if [[ -n "$provider" ]]; then
  pi_args+=(--provider "$provider")
fi
if [[ -n "$model" ]]; then
  pi_args+=(--model "$model")
fi
if [[ -n "$thinking" ]]; then
  pi_args+=(--thinking "$thinking")
fi
if [[ -n "$role_prompt" ]]; then
  pi_args+=(--append-system-prompt "$role_prompt")
fi

if [[ "$transport" == "local" ]]; then
  pi_args+=(-e "$REPO_ROOT/extensions/coms.ts")
else
  pi_args+=(-e "$REPO_ROOT/extensions/coms-net.ts")
fi

if [[ "$load_ui_extensions" == "1" ]]; then
  pi_args+=(-e "$REPO_ROOT/extensions/minimal.ts" -e "$REPO_ROOT/extensions/theme-cycler.ts")
fi

if [[ -n "$name" ]]; then
  pi_args+=(--name "$name")
fi
pi_args+=(--project "$project")
if [[ -n "$purpose" ]]; then
  pi_args+=(--purpose "$purpose")
fi
if [[ -n "$color" ]]; then
  pi_args+=(--color "$color")
fi

if [[ "$transport" == "net" ]]; then
  if [[ -n "$server_url" ]]; then
    pi_args+=(--server-url "$server_url")
  fi
  if [[ -n "$auth_token" ]]; then
    pi_args+=(--auth-token "$auth_token")
  fi
fi

pi_args+=("${extra_pi_args[@]}")

exec pi "${pi_args[@]}"
