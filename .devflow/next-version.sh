#!/usr/bin/env bash
# Prints the next plugin version for a merged pull request.
# Usage: next-version.sh <pr_title> <pr_body_file> <current_version> <last_tag_version>
#   feat -> minor, breaking (`type!:` or a `BREAKING CHANGE:` line) -> major (minor while 0.x),
#   anything else -> patch. If current_version is already above the last tag (bumped by hand in
#   the PR), it is printed unchanged. An empty last_tag_version means no tag yet (0.0.0).
set -euo pipefail

title=$1
body_file=$2
current=$3
last_tag=${4:-0.0.0}
[ -n "$last_tag" ] || last_tag=0.0.0

if [ "$current" != "$last_tag" ] &&
   [ "$(printf '%s\n%s\n' "$current" "$last_tag" | sort -V | tail -1)" = "$current" ]; then
  echo "$current"
  exit 0
fi

IFS=. read -r major minor patch <<< "$current"

if [[ $title =~ ^[a-z]+(\([^\)]*\))?!: ]] || grep -q '^BREAKING CHANGE:' "$body_file"; then
  bump=major
elif [[ $title =~ ^feat(\([^\)]*\))?: ]]; then
  bump=minor
else
  bump=patch
fi
[ "$bump" = major ] && [ "$major" -eq 0 ] && bump=minor

case $bump in
  major) echo "$((major + 1)).0.0" ;;
  minor) echo "$major.$((minor + 1)).0" ;;
  patch) echo "$major.$minor.$((patch + 1))" ;;
esac
