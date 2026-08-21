#!/usr/bin/env bash
#
# Renders the spoken hit callouts to audio, committed under src/assets/voice/.
#
# Why pre-render at all? Two reasons. Live SpeechSynthesis output cannot be
# routed into an AudioContext, so no processing can be applied to it; and the
# voice it picks differs per operating system, so no two players hear the same
# reading. Rendering once fixes both.
#
# This uses the macOS `say` command, which is free and offline but audibly
# synthetic. To upgrade to a neural voice, replace the render_line function
# with a call to a TTS API (see the commented example at the bottom) and re-run.
# Nothing else in the app needs to change: voice.ts just loads whatever files
# are here.
#
# Usage:  ./scripts/render-voice.sh
set -euo pipefail

cd "$(dirname "$0")/.."

VOICE_DIR="src/assets/voice"
SOURCE_JSON="$VOICE_DIR/callouts.json"

# en_GB male; the deepest of the stock macOS set. `say -v '?'` lists the rest.
# "Daniel (Enhanced)" is markedly better if it has been downloaded via
# System Settings > Accessibility > Spoken Content > Manage Voices.
SAY_VOICE="${SAY_VOICE:-Daniel}"
# Words per minute. Slower reads heavier; much below 140 starts to drawl.
SAY_RATE="${SAY_RATE:-150}"
# Mono is plenty for dialogue and halves the size.
AAC_BITRATE="${AAC_BITRATE:-48000}"

command -v say >/dev/null || { echo "error: 'say' not found (macOS only)" >&2; exit 1; }
command -v afconvert >/dev/null || { echo "error: 'afconvert' not found (macOS only)" >&2; exit 1; }
command -v node >/dev/null || { echo "error: 'node' not found" >&2; exit 1; }

# Prefer the enhanced variant automatically when it is installed.
if say -v '?' | grep -q "^${SAY_VOICE} (Enhanced)"; then
  SAY_VOICE="${SAY_VOICE} (Enhanced)"
  echo "note: using the enhanced voice"
fi

echo "voice: ${SAY_VOICE}   rate: ${SAY_RATE} wpm"

# Read via a while loop rather than mapfile: macOS still ships bash 3.2, which
# predates it, and this script should run on the system shell.
LINES=()
while IFS= read -r line; do
  [ -n "$line" ] && LINES+=("$line")
done < <(node -e '
  const data = require("./'"$SOURCE_JSON"'");
  for (const line of data.hit) console.log(line);
')

if [ "${#LINES[@]}" -eq 0 ]; then
  echo "error: no callouts found in $SOURCE_JSON" >&2
  exit 1
fi

# Clear stale renders so a shortened list cannot leave orphans behind.
rm -f "$VOICE_DIR"/hit-*.m4a

total=0
for i in "${!LINES[@]}"; do
  line="${LINES[$i]}"
  out="$VOICE_DIR/hit-$i.m4a"
  tmp="$(mktemp -t battleship-voice).aiff"

  say -v "$SAY_VOICE" -r "$SAY_RATE" -o "$tmp" "$line"
  # -f mp4f: MP4 container. -d aac: AAC. -s 3: VBR constrained, good at low rates.
  # -c 1: downmix to mono.
  afconvert -f mp4f -d aac -b "$AAC_BITRATE" -s 3 -c 1 "$tmp" "$out" >/dev/null
  rm -f "$tmp"

  size=$(stat -f%z "$out")
  total=$((total + size))
  printf '  hit-%d.m4a  %6d bytes  %s\n' "$i" "$size" "$line"
done

printf '\nrendered %d lines, %d bytes total\n' "${#LINES[@]}" "$total"

# ---------------------------------------------------------------------------
# Upgrading to a neural voice
#
# The stock macOS voices are intelligible but plainly synthetic. For a genuinely
# human read, swap the `say`/`afconvert` pair above for a TTS API. Example using
# OpenAI's `onyx` (deep male), with the key kept outside the repo:
#
#   KEY="$(cat ~/.config/openai/battleship-tts.key)"
#   curl -sS https://api.openai.com/v1/audio/speech \
#     -H "Authorization: Bearer $KEY" \
#     -H "Content-Type: application/json" \
#     -d "$(node -e 'console.log(JSON.stringify({
#           model: "gpt-4o-mini-tts",
#           voice: "onyx",
#           speed: 0.9,
#           input: process.argv[1]
#         }))' "$line")" \
#     -o "$VOICE_DIR/hit-$i.mp3"
#
# Then update AUDIO_EXT in src/voice.ts. Everything else is unchanged.
# ---------------------------------------------------------------------------