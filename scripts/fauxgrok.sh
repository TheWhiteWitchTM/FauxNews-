#!/usr/bin/env bash
# FauxGrok. Noon and 8pm US Eastern.
# Reads the wires, files new posts and their stills, pushes those files.
# One short model call when something is new. Nothing new spends nothing.
# It does not rewrite the site.
#
#   fauxgrok.sh noon|prime   cron. Runs only in that US Eastern hour, once.
#   fauxgrok.sh --now        the Grok bots desk. Files the desk now.
#   fauxgrok.sh --self-test
set -euo pipefail

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
logdir="${FAUX_LOG_DIR:-${HOME}/.local/share/fauxnews}"
status_dir="${FAUX_STATUS_DIR:-${HOME}/.local/state/thewhitewitch/desk/status}"
log="${logdir}/fauxgrok.log"
lock="${logdir}/fauxgrok.lock"
slotfile="${logdir}/slot"
status="${status_dir}/fauxnews.txt"

node_bin=""
if [[ -d "${HOME}/.nvm/versions/node" ]]; then
  newest="$(find "${HOME}/.nvm/versions/node" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -V | tail -1)"
  if [[ -n "${newest}" && -x "${HOME}/.nvm/versions/node/${newest}/bin/node" ]]; then
    node_bin="${HOME}/.nvm/versions/node/${newest}/bin"
  fi
fi
export PATH="${node_bin:+$node_bin:}/home/andreas/.grok/bin:/home/andreas/.local/bin:/usr/local/bin:/usr/bin:/bin"
export GIT_TERMINAL_PROMPT=0

due_slot() {
  local slot="$1" hour="$2" day="$3" prev="$4"
  case "$slot" in
    noon) [[ "$hour" == "12" ]] || return 1 ;;
    prime) [[ "$hour" == "20" ]] || return 1 ;;
    *) return 2 ;;
  esac
  [[ "$prev" == "$day $slot" ]] && return 1
  return 0
}

next_label() {
  local hour=$((10#$1))
  if (( hour < 12 || hour >= 20 )); then
    printf 'noon US Eastern'
  else
    printf '8pm US Eastern'
  fi
}

allowed_post_path() {
  case "$1" in
    data/stories.json|feed.xml) return 0 ;;
    *) return 1 ;;
  esac
}

only_faux_subjects() {
  local line
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    [[ "$line" == FauxGrok:* ]] || return 1
  done
  return 0
}

write_status() {
  mkdir -p "$status_dir"
  local tmp="${status}.tmp"
  printf '%s\n' "$1" > "$tmp"
  mv "$tmp" "$status"
}

selftest() {
  due_slot noon 12 2026-10-26 "" 
  due_slot noon 13 2026-10-26 "" && exit 1
  due_slot prime 20 2026-10-26 ""
  due_slot prime 21 2026-10-26 "" && exit 1
  due_slot noon 12 2026-10-26 "2026-10-26 noon" && exit 1
  due_slot prime 20 2026-10-26 "2026-10-26 noon"
  [[ "$(next_label 11)" == "noon US Eastern" ]]
  [[ "$(next_label 12)" == "8pm US Eastern" ]]
  [[ "$(next_label 19)" == "8pm US Eastern" ]]
  [[ "$(next_label 20)" == "noon US Eastern" ]]
  [[ "$(next_label 08)" == "noon US Eastern" ]]
  allowed_post_path data/stories.json
  allowed_post_path feed.xml
  allowed_post_path index.html && exit 1
  printf 'FauxGrok: refresh the desk\nFauxGrok: refresh the desk\n' | only_faux_subjects
  printf 'FauxGrok: refresh the desk\nShrink the masthead\n' | only_faux_subjects && exit 1
  local tmp
  tmp="$(mktemp -d)"
  git -C "$tmp" init -q -b main
  mkdir -p "$tmp/data"
  printf 'a\n' > "$tmp/data/stories.json"
  printf 'b\n' > "$tmp/feed.xml"
  printf 'c\n' > "$tmp/index.html"
  git -C "$tmp" add data/stories.json feed.xml index.html
  git -C "$tmp" -c user.name=Test -c user.email=test@example.com commit -q -m "base"
  printf 'd\n' > "$tmp/data/stories.json"
  printf 'e\n' > "$tmp/index.html"
  local other=0 path line
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    path="${line:3}"
    path="${path##* -> }"
    allowed_post_path "$path" || other=1
  done < <(git -C "$tmp" status --porcelain)
  [[ "$other" == 1 ]]
  rm -rf "$tmp"
  printf 'self-test ok\n'
}

posts_dirty() {
  local line path
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    path="${line:3}"
    path="${path##* -> }"
    allowed_post_path "$path" || return 0
  done < <(git status --porcelain)
  return 1
}

unpushed() {
  git log --pretty=format:%s '@{upstream}..HEAD' 2>/dev/null || true
}

push_faux() {
  local subjects
  subjects="$(unpushed)"
  [[ -n "$subjects" ]] || return 0
  if ! printf '%s\n' "$subjects" | only_faux_subjects; then
    echo "other commits are waiting, did not push"
    return 1
  fi
  echo "push the desk"
  git push origin HEAD || return 1
}

run_desk() {
  local slot="$1" mark="$2" ny_hour="$3" next="$4"
  cd "$root"
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$branch" != "main" ]]; then
    write_status "The desk is not on main. Left it. Next is ${next}."
    echo "not on main"
    return 1
  fi
  if [[ -n "$(git status --porcelain)" ]]; then
    write_status "The desk has uncommitted edits. Left it. Next is ${next}."
    echo "uncommitted edits, left the desk"
    return 1
  fi
  if ! push_faux; then
    write_status "A push is waiting and it is not a desk commit. Left the wires alone."
    return 1
  fi
  if ! git pull --ff-only --quiet origin main; then
    write_status "Could not update main. Left the wires alone. Next is ${next}."
    echo "pull failed"
    return 1
  fi
  local out code
  set +e
  out="$(node scripts/update.mjs 2>&1)"
  code=$?
  set -e
  printf '%s\n' "$out"
  if [[ "$code" != 0 ]]; then
    write_status "The pass failed. Next is ${next}."
    echo "update failed"
    return 1
  fi
  if posts_dirty; then
    git checkout -- .
    write_status "The pass touched more than posts. Restored. Next is ${next}."
    echo "refused extra files"
    return 1
  fi
  git add -- data/stories.json feed.xml
  if git diff --cached --quiet; then
    write_status "Nothing new on the wires. Next is ${next}."
    echo "nothing to file"
    if [[ -n "$mark" ]]; then printf '%s\n' "$mark" > "$slotfile"; fi
    return 0
  fi
  git -c user.name=FauxGrok -c user.email=fauxgrok@thewhitewitch.local commit -m "FauxGrok: refresh the desk" || return 1
  echo "committed the desk"
  if ! push_faux; then
    write_status "Posts are committed. The push did not leave. Next is ${next}."
    return 1
  fi
  write_status "Filed the desk. Posts and stills only. Next is ${next}."
  echo "pushed the desk"
  if [[ -n "$mark" ]]; then printf '%s\n' "$mark" > "$slotfile"; fi
  return 0
}

if [[ "${1:-}" == "--self-test" ]]; then
  selftest
  exit 0
fi

mkdir -p "$logdir" "$status_dir"
exec 9>"$lock"
if ! flock -n 9; then
  printf '%s skip: already running\n' "$(date -Is)" >> "$log"
  exit 0
fi

slot="${1:-}"
case "$slot" in
  noon|prime|--now|"") ;;
  *)
    echo "usage: fauxgrok.sh [noon|prime|--now]" >&2
    exit 2
    ;;
esac

ny_hour="${FAUX_NY_HOUR:-$(TZ=America/New_York date +%H)}"
ny_day="${FAUX_NY_DAY:-$(TZ=America/New_York date +%F)}"
prev=""
[[ -f "$slotfile" ]] && prev="$(cat "$slotfile")"
mark=""
if [[ "$slot" == "noon" || "$slot" == "prime" ]]; then
  if ! due_slot "$slot" "$ny_hour" "$ny_day" "$prev"; then
    exit 0
  fi
  mark="$ny_day $slot"
fi

next="$(next_label "$ny_hour")"
{
  printf '===== %s slot=%s ny=%s %s =====\n' "$(date -Is)" "${slot:-now}" "$ny_day" "$ny_hour"
  run_desk "$slot" "$mark" "$ny_hour" "$next"
} >> "$log" 2>&1
