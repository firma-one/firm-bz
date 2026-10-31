"""
Makes the /tour step cards' narration clips in Brio's voice, with Kokoro (Apache-2.0, runs locally).

Brio's voice is an even blend of two of Kokoro's stock US English male voices, am_michael and
am_fenrir ('am_michael,am_fenrir': Kokoro averages the two). It's set once, as NARRATION_VOICE in
lib/demo/tour-narration.ts, and comes here with the text; see .claude/plans/tour-chapters.md,
Brio's voice.

Reads what every card says aloud from the steps themselves (export-text.mjs), remakes only the clips
whose text or voice changed, removes clips no step uses, and writes public/tour/narration/
manifest.json with each clip's text hash and length. Beside each clip, <key>.json holds when each
word is spoken ([word, start, end] in seconds), for the step card to reveal its words as they're read. lib/demo/tour-narration.test.ts fails until
this has been run after a card's copy changes. See .claude/plans/tour-chapters.md, Narration.

One-time setup (macOS; Kokoro needs Python 3.10–3.12), from frontend/:
    brew install espeak-ng ffmpeg
    python3.12 -m venv scripts/tour-narration/.venv
    scripts/tour-narration/.venv/bin/pip install -r scripts/tour-narration/requirements.txt

Then, from frontend/:
    scripts/tour-narration/.venv/bin/python scripts/tour-narration/generate.py          # changed clips only
    scripts/tour-narration/.venv/bin/python scripts/tour-narration/generate.py --force  # every clip

The first run downloads Kokoro's model (about 330 MB) and a small English language model.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import espeakng_loader

# The espeak-ng bundled with Kokoro's wheel looks for its data where it was built, and exits when
# that isn't there; Homebrew's espeak-ng finds its own. Override with ESPEAK_NG_LIBRARY / ESPEAK_NG_DATA.
espeakng_loader.get_library_path = lambda: os.environ.get("ESPEAK_NG_LIBRARY", "/opt/homebrew/lib/libespeak-ng.dylib")
espeakng_loader.get_data_path = lambda: os.environ.get("ESPEAK_NG_DATA", "/opt/homebrew/share/espeak-ng-data")

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from kokoro import KPipeline  # noqa: E402 (after the espeak paths are set)

FRONTEND = Path(__file__).resolve().parents[2]
OUT = FRONTEND / "public" / "tour" / "narration"
MANIFEST = OUT / "manifest.json"
RATE = 24000  # Kokoro's sample rate


def spoken_text() -> dict:
    """{ voice, clips: [{ key, text, hash }] } from the steps, through export-text.mjs."""
    result = subprocess.run(
        ["node", "scripts/tour-narration/export-text.mjs"], cwd=FRONTEND, capture_output=True, text=True, check=True
    )
    return json.loads(result.stdout)


def encode(audio: np.ndarray, target: Path) -> None:
    """AAC at 64 kbps, evened to one speech loudness so no clip is louder than the next."""
    with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
        sf.write(wav.name, audio, RATE)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", wav.name, "-af", "loudnorm=I=-18:TP=-1.5:LRA=11",
             "-ar", str(RATE), "-ac", "1", "-c:a", "aac", "-b:a", "64k", str(target)],
            check=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="remake every clip, not just the changed ones")
    args = parser.parse_args()

    wanted = spoken_text()
    voice = wanted["voice"]
    old = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {"clips": {}}
    OUT.mkdir(parents=True, exist_ok=True)

    pipeline = None
    clips = {}
    made = 0
    for clip in wanted["clips"]:
        key, text, digest = clip["key"], clip["text"], clip["hash"]
        target = OUT / f"{key}.m4a"
        timings = OUT / f"{key}.json"
        previous = old["clips"].get(key)
        if not args.force and previous and previous["hash"] == digest and target.exists() and timings.exists():
            clips[key] = previous
            continue
        pipeline = pipeline or KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
        chunks, words, offset = [], [], 0.0
        for result in pipeline(text, voice=voice, speed=1.0):
            # Each chunk's word times start from the chunk; the words carry on from the ones before.
            for token in result.tokens or []:
                if token.start_ts is not None and any(char.isalnum() for char in token.text):
                    words.append([token.text, round(offset + token.start_ts, 2), round(offset + token.end_ts, 2)])
            chunks.append(np.asarray(result.audio))
            offset += len(result.audio) / RATE
        audio = np.concatenate(chunks)
        encode(audio, target)
        timings.write_text(json.dumps({"words": words}, ensure_ascii=False, separators=(",", ":")) + "\n")
        clips[key] = {"hash": digest, "seconds": round(len(audio) / RATE, 2)}
        made += 1
        print(f"{key}: {clips[key]['seconds']}s, {len(words)} words", file=sys.stderr)

    removed = 0
    for stale in list(OUT.glob("*.m4a")) + [path for path in OUT.glob("*.json") if path != MANIFEST]:
        if stale.stem not in clips:
            stale.unlink()
            removed += 1

    MANIFEST.write_text(json.dumps({"voice": voice, "clips": dict(sorted(clips.items()))}, indent=2) + "\n")
    print(f"{made} made, {len(clips) - made} unchanged, {removed} removed", file=sys.stderr)


if __name__ == "__main__":
    main()
