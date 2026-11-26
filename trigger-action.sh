#!/usr/bin/env bash
# Triggers the "GitHub Actions" workflow (.github/workflows/action.yml) of
# sbergot/sonos-configure via the workflow_dispatch API.
#
# Usage:
#   ./trigger-action.sh [pat-file] [ref]
#
#   pat-file  File containing a GitHub Personal Access Token (classic token
#             with the "repo" scope, or fine-grained token with
#             "Actions: read and write" on this repository).
#             Defaults to ./github.pat
#   ref       Branch, tag or commit SHA to run the workflow on.
#             Defaults to main.
#
# Example:
#   echo ghp_xxxxxxxxxxxxxxxxxxxx > github.pat
#   chmod 600 github.pat
#   ./trigger-action.sh

set -euo pipefail

REPO="sbergot/sonos-configure"
WORKFLOW="action.yml"
URL="https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches"

PAT_FILE="${1:-github.pat}"
REF="${2:-main}"

if [[ ! -f "$PAT_FILE" ]]; then
  echo "error: PAT file '$PAT_FILE' not found." >&2
  echo "usage: $0 [pat-file] [ref]" >&2
  exit 1
fi

# Strip any trailing newline/whitespace from the token.
PAT="$(tr -d '[:space:]' < "$PAT_FILE")"
if [[ -z "$PAT" ]]; then
  echo "error: PAT file '$PAT_FILE' is empty." >&2
  exit 1
fi

HEADERS="$(mktemp)"
trap 'rm -f "$HEADERS"' EXIT

if ! BODY="$(curl -sS -D "$HEADERS" \
  -X POST \
  -H "Authorization: Bearer ${PAT}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d "{\"ref\": \"${REF}\"}" \
  "$URL")"; then
  echo "error: request to GitHub API failed (network or curl error)." >&2
  exit 1
fi

HTTP_CODE="$(head -n1 "$HEADERS" | tr -d '\r' | awk '{print $2}')"

case "$HTTP_CODE" in
  204)
    echo "workflow '${WORKFLOW}' triggered on '${REF}' (HTTP 204)."
    ;;
  401|403)
    echo "error: authentication/permission denied (HTTP ${HTTP_CODE}) - check the PAT in '$PAT_FILE' and its scopes." >&2
    echo "$BODY" >&2
    exit 1
    ;;
  404)
    echo "error: repository or workflow not found (HTTP 404)." >&2
    echo "$BODY" >&2
    exit 1
    ;;
  422)
    echo "error: validation failed (HTTP 422) - is '${REF}' a valid ref, and does the workflow allow workflow_dispatch?" >&2
    echo "$BODY" >&2
    exit 1
    ;;
  *)
    echo "error: unexpected response (HTTP ${HTTP_CODE})." >&2
    echo "$BODY" >&2
    exit 1
    ;;
esac
