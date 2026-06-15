"""
Normalize any audio or video file to 16 kHz mono 16-bit WAV before diarization.

Pyannote's model operates at 16 kHz mono internally, so converting upfront:
- avoids pyannote loading a 6× larger 24-bit / 48 kHz / stereo file into memory
- extracts the audio track from video files (.mp4, .webm, etc.) transparently
"""

import logging
import subprocess
import tempfile

logger = logging.getLogger(__name__)


def preprocess_audio(input_path: str) -> str:
    """
    Convert *input_path* to a 16 kHz mono 16-bit PCM WAV temp file.

    Works for any format ffmpeg understands, including video containers
    (.mp4, .webm) - the video track is discarded via -vn.

    Returns the path to the new temp WAV file (caller must delete it).
    Raises RuntimeError if ffmpeg exits non-zero.
    """
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp.close()

    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-vn",              # drop video track; extract audio only
        "-ac", "1",         # mono
        "-ar", "16000",     # 16 kHz - pyannote's native sample rate
        "-sample_fmt", "s16",  # 16-bit PCM
        tmp.name,
    ]

    logger.info("Preprocessing %s → %s (16 kHz mono WAV)", input_path, tmp.name)
    result = subprocess.run(cmd, capture_output=True)

    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg preprocessing failed (exit {result.returncode}): "
            f"{result.stderr.decode(errors='replace')}"
        )

    return tmp.name
