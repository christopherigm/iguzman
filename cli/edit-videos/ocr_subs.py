#!/usr/bin/env python3
"""OCR a bitmap subtitle stream (DVD/VobSub) into a SubRip (.srt) file.

MP4 cannot store image subtitles - its only subtitle codec, mov_text, is text
only.  Sources that carry dvd_subtitle tracks therefore lose them when the
Smart TV profile remuxes to MP4.  This script recovers them as text.

How the timing works
--------------------
Feeding a bitmap subtitle stream into a video filter makes FFmpeg apply its
"sub2video" conversion: it emits one RGBA frame every time the picture on
screen changes.  Concretely that means a cue starts on a frame with at least one
opaque pixel, and ends on the very next frame - which is either the blank
"clear" frame FFmpeg emits when the cue disappears, or the frame of the cue that
replaces it.  `showinfo` gives us each frame's presentation timestamp, so cue
boundaries fall out of the frame sequence without decoding VobSub's RLE
ourselves.

Each cue frame is cropped to its opaque bounding box, flattened onto black and
inverted, so tesseract sees black text on white.  The bitmap is fed at its native
resolution: upscaling it first measurably *lowers* accuracy (see --scale).

Progress is written to stdout as `ocr <done>/<total>` lines; lib/progress.sh
parses those to draw the progress bar.
"""

import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageOps

# `showinfo` prints one line per frame; we only need its presentation timestamp.
_PTS_RE = re.compile(r"pts_time:([0-9]+(?:\.[0-9]+)?)")

# A cue that ends on the same timestamp it starts on would be invisible.
_MIN_CUE_SEC = 0.2
# The final cue has no following frame to end it.
_LAST_CUE_SEC = 3.0

# In these subtitle fonts tesseract reads a capital I as a vertical bar.  Only a
# bar that stands alone as a word - or that leads a contraction like |'ve - is
# safe to rewrite; a bar glued to letters is a different misread and is left
# alone.  Blacklisting "|" in tesseract instead is worse: it scatters the glyph
# across 1 / l / I rather than concentrating it on one recoverable character.
_BAR_AS_I = re.compile(r"(?<![^\W\d_])\|(?=$|[\s'’.,!?])", re.UNICODE)


def rasterize(ffmpeg, video, stream, work):
    """Render subtitle stream `stream` to PNG frames; return their timestamps."""
    pattern = os.path.join(work, "f_%08d.png")
    cmd = [
        ffmpeg, "-hide_banner", "-nostdin", "-y", "-loglevel", "info",
        "-i", video,
        "-filter_complex", f"[0:s:{stream}]null,showinfo[v]",
        "-map", "[v]", "-fps_mode", "passthrough",
        pattern,
    ]
    proc = subprocess.run(cmd, stdout=subprocess.DEVNULL,
                          stderr=subprocess.PIPE, text=True, errors="replace")

    frames = sorted(glob.glob(os.path.join(work, "f_*.png")))
    if proc.returncode != 0 and not frames:
        sys.stderr.write(proc.stderr[-2000:])
        raise RuntimeError("ffmpeg could not rasterize the subtitle stream")

    stamps = [float(m) for m in _PTS_RE.findall(proc.stderr)]
    if not frames:
        raise RuntimeError("subtitle stream produced no frames")

    # showinfo emits exactly one line per written frame, but clamp defensively:
    # a truncated log must not silently shift every cue's timestamp.
    n = min(len(frames), len(stamps))
    if n == 0:
        raise RuntimeError("could not read subtitle timestamps")
    return frames[:n], stamps[:n]


def cue_frames(frames, stamps):
    """Pair each non-blank frame with the timestamp of the frame that clears it."""
    cues = []
    for i, path in enumerate(frames):
        with Image.open(path) as im:
            alpha = im.convert("RGBA").getchannel("A")
            if alpha.getextrema()[1] == 0:
                continue  # blank "clear" frame - it only ends the previous cue
        start = stamps[i]
        end = stamps[i + 1] if i + 1 < len(stamps) else start + _LAST_CUE_SEC
        if end - start < _MIN_CUE_SEC:
            end = start + _MIN_CUE_SEC
        cues.append((start, end, path))
    return cues


def prepare(path, out_path, scale):
    """Crop to the drawn pixels and render black-text-on-white for tesseract."""
    with Image.open(path) as raw:
        im = raw.convert("RGBA")
        bbox = im.getchannel("A").getbbox()
        if bbox is None:
            return False
        im = im.crop(bbox)
        flat = Image.alpha_composite(Image.new("RGBA", im.size, (0, 0, 0, 255)), im)
        gray = flat.convert("L")
        if scale > 1:
            # NEAREST, not LANCZOS: these glyphs are pixel art, and a smooth
            # filter's anti-aliased edges measurably worsen recognition.
            gray = gray.resize((gray.width * scale, gray.height * scale), Image.NEAREST)
        # Subtitle glyphs are light on a dark matte; tesseract wants the inverse.
        ImageOps.invert(gray).save(out_path)
    return True


def clean_line(line):
    line = _BAR_AS_I.sub("I", line)
    # A bar closing a bracketed sound cue - "[car horn honks|]", "[gasps|" - is
    # a misread "]".
    line = line.replace("|]", "]")
    if line.endswith("|") and line.count("[") > line.count("]"):
        line = line[:-1] + "]"
    return line


def ocr_one(tesseract, img, lang, psm):
    proc = subprocess.run(
        [tesseract, img, "stdout", "-l", lang, "--psm", str(psm)],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, errors="replace")
    if proc.returncode != 0:
        return ""
    lines = [clean_line(" ".join(ln.split())) for ln in proc.stdout.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def srt_time(seconds):
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    ap.add_argument("--tesseract", default="tesseract")
    ap.add_argument("--input", required=True)
    ap.add_argument("--stream", type=int, required=True,
                    help="subtitle stream index relative to its type (ffmpeg 0:s:N)")
    ap.add_argument("--lang", default="eng", help="tesseract language code")
    ap.add_argument("--output", required=True)
    ap.add_argument("--psm", type=int, default=6, help="tesseract page segmentation mode")
    # Measured on a 1395-cue DVD source: upscaling before OCR consistently hurts
    # (out-of-vocabulary rate 1.11% at 1x vs 1.31% at 2x and 1.61% at 3x), because
    # tesseract 4's LSTM reads the native pixel grid better than any resampling of
    # it. Left configurable for odd sources, but 1 (no resize) is the right default.
    ap.add_argument("--scale", type=int, default=1, help="upscale factor before OCR")
    ap.add_argument("--jobs", type=int, default=min(8, (os.cpu_count() or 2)))
    args = ap.parse_args()

    work = tempfile.mkdtemp(prefix="edit_videos_ocr_")
    try:
        frames, stamps = rasterize(args.ffmpeg, args.input, args.stream, work)
        cues = cue_frames(frames, stamps)
        total = len(cues)
        if total == 0:
            sys.stderr.write("no subtitle cues found in stream\n")
            return 1

        print(f"ocr 0/{total}", flush=True)

        def run(idx_cue):
            idx, (start, end, path) = idx_cue
            prepped = os.path.join(work, f"p_{idx:08d}.png")
            if not prepare(path, prepped, args.scale):
                return idx, start, end, ""
            return idx, start, end, ocr_one(args.tesseract, prepped, args.lang, args.psm)

        results = []
        done = 0
        with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
            for item in pool.map(run, enumerate(cues)):
                results.append(item)
                done += 1
                print(f"ocr {done}/{total}", flush=True)

        results.sort(key=lambda r: r[0])
        written = 0
        with open(args.output, "w", encoding="utf-8") as fh:
            for _, start, end, text in results:
                if not text:
                    continue  # unreadable bitmap - drop the cue rather than emit noise
                written += 1
                fh.write(f"{written}\n{srt_time(start)} --> {srt_time(end)}\n{text}\n\n")

        if written == 0:
            sys.stderr.write("tesseract recognised no text in this stream\n")
            return 1
        sys.stderr.write(f"recognised {written}/{total} cues\n")
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
