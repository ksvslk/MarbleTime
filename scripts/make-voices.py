#!/usr/bin/env python3
"""Record every line the TV speaks as an MP3 clip, and write the clip map the app plays from.

The lines come from the app itself (spokenLines in voiceLines.ts, via scripts/voice-lines.ts), so what is
recorded always matches what is shown. Nothing is synthesised on the TV.

  All four languages: Google Gemini-TTS (Cloud Text-to-Speech, one narrator voice, a warm read-aloud style),
  through this machine's gcloud sign-in (`gcloud auth login`; project from GOOGLE_CLOUD_PROJECT or gcloud's
  config). The characters speak with Gemini voices too (backend/src/speech).

Every clip is checked before it is kept: Gemini listens to it in the same language and the transcript must match
the line (a voice model can guess the wrong language on a short word, "Jee!" said like English "gee", or say a short
line twice), and its speech mustn't run far longer than the line needs. A clip that fails is made again, up to 6
times; then the script stops and names the line, so a person decides. No per-word rules.

Only new or changed lines are recorded; clips that no line uses any more are deleted.

Usage: python3 scripts/make-voices.py   (needs gcloud and ffmpeg)
Output: tv/packages/shared/src/assets/voice/<lang>/*.mp3 and tv/packages/shared/src/marble/voices.ts
"""
import base64
import difflib
import hashlib
import re
import unicodedata
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHARED = ROOT / "tv/packages/shared"
OUT = SHARED / "src/assets/voice"
MAP = SHARED / "src/marble/voices.ts"

# One friendly, clear narrator for every language, a little slower than normal for young listeners.
MODEL = "gemini-2.5-flash-tts"  # the characters' model too (pro-tts allows only a few requests a minute)
VOICE = "Leda"
LANGUAGE = {"en": "en-US", "et": "et-EE", "de": "de-DE", "es": "es-ES"}
LANGUAGE_NAME = {"en": "English", "et": "Estonian", "de": "German", "es": "Spanish"}
LISTENER = "gemini-3.8-flash"
MATCH = 0.85  # transcript ~ line (measured: right lines 0.96-1.00, wrong ones 0.25-0.69)
ATTEMPTS = 6


def style(lang: str) -> str:
    """The narrator: a short description that names the language (the backend's narrator uses the same,
    backend/src/speech). Measured: without the language, "Jee!" came out as English "gee"; imperative instructions
    ("say it once, don't add words") were sometimes read aloud."""
    return f"A native {LANGUAGE_NAME[lang]} speaker: warm, clear and friendly, to a young child."
# Bump when finish() changes, so every clip is made again.
PROCESSING = "v2: lead trim, natural tail + 300 ms pad"
# Maths is shown with symbols ("7 + 5 = 12") but said with words.
MATHS = {"en": ("plus", "is"), "et": ("pluss", "on"), "de": ("plus", "ist"), "es": ("más", "es")}


def lines_by_lang() -> dict:
    tsx = SHARED / "node_modules/.bin/tsx"
    out = subprocess.run([str(tsx), str(ROOT / "scripts/voice-lines.ts")], check=True, capture_output=True, text=True)
    printed = json.loads(out.stdout)
    NUMBERS.update(printed["numbers"])
    return printed["lines"]


# Each language's words for 0–20 (from the app), longest first when matching.
NUMBERS: dict = {}


def digits(lang: str, text: str) -> str:
    """The line with its number words as digits ("Three marbles" → "3 marbles"): the listener writes numbers as
    digits, so the two are compared the same way."""
    words = sorted(enumerate(NUMBERS.get(lang, [])), key=lambda pair: -len(pair[1]))
    for n, word in words:
        text = re.sub(rf"(?<!\w){re.escape(word)}(?!\w)", str(n), text, flags=re.IGNORECASE)
    return text


def spoken(lang: str, text: str) -> str:
    plus, equals = MATHS[lang]
    return text.replace(" + ", f" {plus} ").replace(" = ", f" {equals} ")


def clip_name(lang: str, text: str) -> str:
    return hashlib.sha1(f"{lang}|{MODEL}|{VOICE}|{style(lang)}|{PROCESSING}|{text}".encode()).hexdigest()[:12] + ".mp3"


_AUTH: dict = {}


def google_auth() -> tuple[str, str]:
    """The gcloud sign-in's token and project. The token is asked for again every few minutes: gcloud hands out the
    one it has until that is about to run out, and a long recording run outlives it."""
    if not _AUTH or time.time() - _AUTH["at"] > 240:
        _AUTH["token"] = subprocess.run(["gcloud", "auth", "print-access-token"], check=True, capture_output=True, text=True).stdout.strip()
        _AUTH.setdefault("project", os.environ.get("GOOGLE_CLOUD_PROJECT") or subprocess.run(
            ["gcloud", "config", "get-value", "project"], check=True, capture_output=True, text=True).stdout.strip())
        _AUTH["at"] = time.time()
    return _AUTH["token"], _AUTH["project"]


def google(url: str, body: dict, auth: tuple[str, str]) -> dict:
    """POST to a Google API; a timeout, a busy model or the per-minute quota (low on this project) is waited out."""
    answer: dict = {}
    for attempt in range(8):
        token, project = google_auth()
        # The body goes in on stdin: no audio (or token) on a command line or in an error message.
        out = subprocess.run(
            ["curl", "-sS", "-m", "60", "-X", "POST", url, "-H", f"Authorization: Bearer {token}",
             "-H", f"x-goog-user-project: {project}", "-H", "Content-Type: application/json", "--data-binary", "@-"],
            input=json.dumps(body), capture_output=True, text=True)
        if out.returncode == 0:
            answer = json.loads(out.stdout or "{}")
            # Only a bad request or missing rights are final; anything else (busy, quota, cancelled) is waited out.
            if "error" not in answer or answer["error"].get("code") in (400, 401, 403, 404):
                return answer
        time.sleep(min(60, 10 * 2 ** attempt))
    raise RuntimeError(f"{url.rsplit('/', 1)[-1]} kept failing: {answer.get('error', {}).get('status', 'no answer')}")


def gemini(lang: str, text: str, raw: pathlib.Path, auth: tuple[str, str]) -> None:
    answer = google("https://texttospeech.googleapis.com/v1/text:synthesize", {
        "input": {"prompt": style(lang), "text": spoken(lang, text)},
        "voice": {"languageCode": LANGUAGE[lang], "name": VOICE, "modelName": MODEL},
        "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": 24000},
    }, auth)
    if "audioContent" not in answer:
        raise RuntimeError(f"{lang} {text!r}: {answer.get('error', {}).get('message', 'no audio')[:200]}")
    raw.write_bytes(base64.b64decode(answer["audioContent"]))


def finish(raw: pathlib.Path, out: pathlib.Path) -> None:
    """Trim the silence before the first word (a quick start), keep the last word's natural fade and add
    300 ms of silence after it (trimming the end, and some players, clipped the last syllable), even out
    loudness across both voice services, mono MP3."""
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw),
         "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=0.3",
         "-ac", "1", "-ar", "24000", "-b:a", "48k", str(out)],
        check=True)


def padded(wav_path: pathlib.Path) -> bytes:
    """The clip with half a second of silence on each side: on very short clips the listener made up words."""
    out = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(wav_path), "-af", "adelay=500:all=1,apad=pad_dur=0.5",
                          "-f", "wav", "-"], check=True, capture_output=True)
    return out.stdout


def speech_seconds(wav_path: pathlib.Path) -> float:
    """How long the speech itself runs: the file without its silent start and end."""
    out = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(wav_path), "-af",
                          "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                          "-f", "wav", "-"], check=True, capture_output=True)
    return max(0.0, (len(out.stdout) - 44) / (24000 * 2))


def heard(lang: str, wav: bytes, auth: tuple[str, str]) -> str:
    """What Gemini hears in the clip, as text in the line's language."""
    name = LANGUAGE_NAME[lang]
    _, project = auth
    answer = google(
        f"https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/{LISTENER}:generateContent",
        {"contents": [{"role": "user", "parts": [
            {"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(wav).decode()}},
            {"text": f"Write exactly what is said in this {name} audio, as {name} text. Write numbers as digits. Only the words, nothing else."}]}],
         "generationConfig": {"maxOutputTokens": 300, "thinkingConfig": {"thinkingLevel": "low"}}},
        auth)
    parts = answer.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()


def letters(text: str) -> str:
    return re.sub(r"[^\w]", "", unicodedata.normalize("NFC", text).lower())


def check(lang: str, text: str, wav_path: pathlib.Path, auth: tuple[str, str]) -> str | None:
    """None if the clip says the line; otherwise why not."""
    seconds = speech_seconds(wav_path)
    # Generous: a second plus about 150 ms a letter; lines said twice or padded with extra words ran far longer.
    if seconds > 1.0 + 0.15 * len(text):
        return f"{seconds:.1f} s of speech is too long"
    transcript = heard(lang, padded(wav_path), auth)
    score = difflib.SequenceMatcher(None, letters(digits(lang, spoken(lang, text))), letters(digits(lang, transcript))).ratio()
    return None if score >= MATCH else f"heard {transcript!r} ({score:.2f})"


def record(lang: str, text: str, out: pathlib.Path, auth: tuple[str, str]) -> str | None:
    """Makes the clip; returns why it couldn't be made right, or None."""
    problem = None
    for attempt in range(ATTEMPTS):
        with tempfile.TemporaryDirectory() as tmp:
            raw = pathlib.Path(tmp) / "raw.wav"
            try:
                gemini(lang, text, raw, auth)
            except RuntimeError as error:
                problem = str(error)
                continue
            problem = check(lang, text, raw, auth)
            if problem is None:
                finish(raw, out)
                print(f"  {lang}  {text}" + (f"  (try {attempt + 1})" if attempt else ""), flush=True)
                return None
            print(f"  {lang}  {text}: {problem}, again", flush=True)
    return f"{lang} {text!r}: {problem}"


def main() -> None:
    lines = lines_by_lang()
    try:
        auth = google_auth()
    except subprocess.CalledProcessError:
        sys.exit("gcloud isn't signed in: run `gcloud auth login`.")
    entries = {}
    todo = []
    for lang, texts in lines.items():
        folder = OUT / lang
        folder.mkdir(parents=True, exist_ok=True)
        entries[lang] = {}
        for text in texts:
            name = clip_name(lang, text)
            entries[lang][text] = name
            if not (folder / name).exists():
                todo.append((lang, text, folder / name))
    with ThreadPoolExecutor(max_workers=1) as pool:
        failed = [problem for problem in pool.map(lambda job: record(*job, auth), todo) if problem]
    made = len(todo) - len(failed)
    # A line that couldn't be made right has no clip: the TV stays silent there rather than saying it wrong.
    for lang in entries:
        entries[lang] = {text: name for text, name in entries[lang].items() if (OUT / lang / name).exists()}
        for old in (OUT / lang).glob("*.mp3"):
            if old.name not in entries[lang].values():
                old.unlink()

    rows = ["// Generated by scripts/make-voices.py from spokenLines() in voiceLines.ts. Do not edit.",
            "// Text → recorded clip, per language.",
            "export const VOICES: Record<string, Record<string, number>> = {"]
    for lang, clips in entries.items():
        rows.append(f"  {lang}: {{")
        rows += [f"    {json.dumps(text, ensure_ascii=False)}: require('../assets/voice/{lang}/{name}')," for text, name in clips.items()]
        rows.append("  },")
    rows.append("};")
    MAP.write_text("\n".join(rows) + "\n")
    print(f"recorded {made} new clips; {sum(len(c) for c in entries.values())} in {MAP.relative_to(ROOT)}")
    if failed:
        sys.exit("These lines couldn't be recorded right, so the TV stays silent there; a person should listen and decide:\n  " + "\n  ".join(failed))


if __name__ == "__main__":
    main()
