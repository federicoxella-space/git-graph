#!/usr/bin/env bash
# Installed by devflow 0.10.0. Re-run /devflow:init → Release to update.
#
# Releases one merged pull request (GitHub) or merge request (GitLab): tag vX.Y.Z on RELEASE_SHA and
# a release whose notes are the PR title. The version comes from the title (see next-version.sh),
# starting from the highest vX.Y.Z tag. Tags and releases are created through the API: nothing is
# committed or pushed, so it works with a protected base branch.
#
# Env: RELEASE_FORGE (github | gitlab), RELEASE_SHA, and
#   github: PR_TITLE, PR_BODY, PR_NUMBER, GH_TOKEN
#   gitlab: CI_COMMIT_MESSAGE, CI_API_V4_URL, CI_PROJECT_ID, CI_JOB_TOKEN
set -euo pipefail

dir=$(cd "$(dirname "$0")" && pwd)
forge=${RELEASE_FORGE:?RELEASE_FORGE is required}
sha=${RELEASE_SHA:?RELEASE_SHA is required}

needed="git curl"
[ "$forge" = github ] && needed="git gh"
for tool in $needed; do
  if ! command -v "$tool" > /dev/null; then
    echo "devflow-release: '$tool' is missing on the runner. Install bash, git and curl, or set" \
         "DEVFLOW_RELEASE_IMAGE to an image that has them." >&2
    exit 1
  fi
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Title, body and PR number.
if [ "$forge" = github ]; then
  title=$PR_TITLE
  printf '%s' "${PR_BODY:-}" > "$work/body"
  number=${PR_NUMBER:-}
  mark='#'
else
  msg=$CI_COMMIT_MESSAGE
  title=$(printf '%s\n' "$msg" | head -n 1)
  if [[ $title == "Merge branch "* ]]; then
    # Default merge commit template: the MR title is the first non-empty line after the subject.
    title=$(printf '%s\n' "$msg" | tail -n +2 | grep -m 1 -v '^[[:space:]]*$' || true)
  fi
  printf '%s' "$msg" > "$work/body"
  number=$(printf '%s\n' "$msg" | sed -n 's/^See merge request .*!\([0-9][0-9]*\)$/\1/p' | head -n 1)
  mark='!'
fi
[ -n "$title" ] || { echo "devflow-release: no title found" >&2; exit 1; }
note="- $title"
[ -z "$number" ] || note="$note ($mark$number)"

json_escape() {
  # Quoted replacements are literal in every bash version (unquoted backslashes are not).
  local s=$1 bs='\' dq='"'
  s=${s//"$bs"/"$bs$bs"}; s=${s//"$dq"/"$bs$dq"}
  s=${s//$'\n'/"${bs}n"}; s=${s//$'\r'/"${bs}r"}; s=${s//$'\t'/"${bs}t"}
  printf '%s' "$s"
}

# create_release <tag>: 0 created, 3 the tag already exists, 1 any other error.
create_release() {
  local tag=$1 code
  : > "$work/out"
  if [ "$forge" = github ]; then
    if gh release create "$tag" --target "$sha" --title "$tag" --notes "$note" > "$work/out" 2>&1; then
      return 0
    fi
  else
    printf '{"tag_name":"%s","ref":"%s","name":"%s","description":"%s"}' \
      "$tag" "$sha" "$tag" "$(json_escape "$note")" > "$work/req.json"
    code=$(curl --silent --show-error --output "$work/out" --write-out '%{http_code}' \
      --header "JOB-TOKEN: $CI_JOB_TOKEN" --header "Content-Type: application/json" \
      --request POST --data "@$work/req.json" "$CI_API_V4_URL/projects/$CI_PROJECT_ID/releases")
    [[ $code == 2* ]] && return 0
    [ "$code" = 409 ] && return 3
  fi
  grep -qi 'already.exists' "$work/out" && return 3
  cat "$work/out" >&2
  return 1
}

# append_note <tag>: add this PR's line to the notes of a later release that already contains it.
append_note() {
  local tag=$1 notes
  if [ "$forge" = github ]; then
    notes=$(gh release view "$tag" --json body -q .body)
    grep -qxF -- "$note" <<< "$notes" || gh release edit "$tag" --notes "$notes"$'\n'"$note" > /dev/null
  elif command -v jq > /dev/null; then
    local url="$CI_API_V4_URL/projects/$CI_PROJECT_ID/releases/$tag"
    notes=$(curl --silent --fail --header "JOB-TOKEN: $CI_JOB_TOKEN" "$url" | jq -r .description)
    if ! grep -qxF -- "$note" <<< "$notes"; then
      jq -n --arg d "$notes"$'\n'"$note" '{description: $d}' > "$work/req.json"
      curl --silent --fail --output /dev/null --header "JOB-TOKEN: $CI_JOB_TOKEN" \
        --header "Content-Type: application/json" --request PUT --data "@$work/req.json" "$url"
    fi
  else
    echo "devflow-release: jq missing, '$note' not added to the notes of $tag" >&2
  fi
}

# git sorts versions itself: BusyBox `sort` (alpine) may not support -V.
semver_tags() { git tag -l 'v*' --sort=v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true; }

for attempt in 1 2 3 4 5; do
  git fetch -q --tags --force origin

  if git tag --points-at "$sha" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "$sha is already released, nothing to do"
    exit 0
  fi

  last=$(semver_tags | tail -n 1)
  if [ -n "$last" ] && git merge-base --is-ancestor "$sha" "$last^{commit}"; then
    # A later merge was released first: this one is already inside it.
    append_note "$last"
    echo "$sha is included in $last: note added there"
    exit 0
  fi

  current=${last#v}
  next=$(bash "$dir/next-version.sh" "$title" "$work/body" "${current:-0.0.0}" "$current")
  status=0
  create_release "v$next" || status=$?
  case $status in
    0) echo "released v$next"; exit 0 ;;
    3) echo "v$next was taken (attempt $attempt), retrying"; sleep $((attempt * 2)) ;;
    *) exit 1 ;;
  esac
done

echo "devflow-release: could not create a release after 5 attempts" >&2
exit 1
