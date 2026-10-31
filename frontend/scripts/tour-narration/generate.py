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
    """{ voice, clips, lines } from the steps and Brio's other lines, through export-text.mjs."""
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


_pipeline = None


def speak(text: str, voice: str, pause: float = 0.0) -> tuple[np.ndarray, list]:
    """The text in the voice, and when each word in it is spoken: [word, start, end] in seconds.

    With a pause, that much more silence goes after each sentence that has another after it, on top
    of Kokoro's own, for a little more breathing room. It's added to the spoken whole, in the quiet
    after each full stop: spoken a sentence at a time instead, Kokoro slowed every sentence down by
    about a third."""
    global _pipeline
    _pipeline = _pipeline or KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    chunks, words, stops, offset = [], [], [], 0.0
    for result in _pipeline(text, voice=voice, speed=1.0):
        # Each chunk's word times start from the chunk; the words carry on from the ones before.
        for token in result.tokens or []:
            if token.start_ts is None:
                continue
            if any(char.isalnum() for char in token.text):
                words.append([token.text, round(offset + token.start_ts, 2), round(offset + token.end_ts, 2)])
            elif token.text in (".", "!", "?"):
                # The middle of a full stop's own stretch, which is silence.
                stops.append(offset + (token.start_ts + token.end_ts) / 2)
        chunks.append(np.asarray(result.audio))
        offset += len(result.audio) / RATE
    audio = np.concatenate(chunks)
    stops = [stop for stop in stops if words and stop < words[-1][1]]
    if not pause or not stops:
        return audio, words
    silence = np.zeros(int(pause * RATE), dtype=audio.dtype)
    pieces, at = [], 0
    for stop in stops:
        cut = int(stop * RATE)
        pieces += [audio[at:cut], silence]
        at = cut
    pieces.append(audio[at:])
    for word in words:
        later = pause * sum(1 for stop in stops if stop < word[1])
        word[1], word[2] = round(word[1] + later, 2), round(word[2] + later, 2)
    return np.concatenate(pieces), words


LEVELS_PER_SECOND = 20


def levels(audio: np.ndarray) -> list:
    """How loud the voice is through the clip, 20 times a second from 0 to 1: what a wave beside the
    player follows, quiet in the pauses. Scaled to the clip's loud stretches, not its single peak."""
    window = RATE // LEVELS_PER_SECOND
    frames = len(audio) // window
    rms = np.sqrt(np.mean(np.square(audio[: frames * window].reshape(frames, window)), axis=1))
    loud = np.percentile(rms, 95) or 1.0
    return [round(float(min(1.0, value / loud)), 2) for value in rms]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="remake every clip, not just the changed ones")
    args = parser.parse_args()

    wanted = spoken_text()
    voice = wanted["voice"]
    old = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {"clips": {}}
    OUT.mkdir(parents=True, exist_ok=True)

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
        audio, words = speak(text, voice)
        encode(audio, target)
        timings.write_text(json.dumps({"words": words}, ensure_ascii=False, separators=(",", ":")) + "\n")
        clips[key] = {"hash": digest, "seconds": round(len(audio) / RATE, 2)}
        made += 1
        print(f"{key}: {clips[key]['seconds']}s, {len(words)} words", file=sys.stderr)

    # Brio's other recordings: each a clip and, beside it, its hash, length, word times and levels.
    for line in wanted.get("lines", []):
        target = FRONTEND / f"{line['out']}.m4a"
        timings = FRONTEND / f"{line['out']}.json"
        previous = json.loads(timings.read_text()) if timings.exists() else {}
        if not args.force and previous.get("hash") == line["hash"] and target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        audio, words = speak(line["text"], voice, line.get("pause", 0))
        encode(audio, target)
        seconds = round(len(audio) / RATE, 2)
        timings.write_text(json.dumps(
            {"hash": line["hash"], "seconds": seconds, "words": words, "levels": levels(audio)},
            ensure_ascii=False, separators=(",", ":"),
        ) + "\n")
        made += 1
        print(f"{line['key']}: {seconds}s, {len(words)} words", file=sys.stderr)

    removed = 0
    for stale in list(OUT.glob("*.m4a")) + [path for path in OUT.glob("*.json") if path != MANIFEST]:
        if stale.stem not in clips:
            stale.unlink()
            removed += 1

    MANIFEST.write_text(json.dumps({"voice": voice, "clips": dict(sorted(clips.items()))}, indent=2) + "\n")
    total = len(clips) + len(wanted.get("lines", []))
    print(f"{made} made, {total - made} unchanged, {removed} removed", file=sys.stderr)


if __name__ == "__main__":
    main()
