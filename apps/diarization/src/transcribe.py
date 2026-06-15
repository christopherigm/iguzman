"""
Speaker-attributed transcription.

Runs pyannote diarization and faster-whisper transcription on the same audio
file, then merges the results by temporal overlap: each Whisper segment is
assigned to the pyannote speaker that covers the most of its duration.
"""

import logging

from models import get_diarization_pipeline, get_whisper_model

logger = logging.getLogger(__name__)


def run_transcription_with_diarization(
    audio_path: str,
    language: str | None = None,
    num_speakers: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
    max_words: int = 4,
) -> list[dict]:
    """
    Transcribe an audio file and attribute each segment to a speaker.

    Args:
        audio_path:    Path to a local audio file.
        language:      BCP-47 language code (e.g. "en", "es"). Auto-detected if None.
        num_speakers:  Exact number of speakers for pyannote.
        min_speakers:  Minimum number of speakers for pyannote.
        max_speakers:  Maximum number of speakers for pyannote.
        max_words:     Maximum number of words per subtitle row. Each Whisper
                       segment is re-chunked into rows of at most this many words
                       using per-word timestamps. Use <= 0 to keep Whisper's
                       native (full-segment) rows. Defaults to 4.

    Returns:
        List of dicts: {speaker, start, end, text, language}
        `language` key only appears on the first segment (detected by Whisper).
    """
    whisper_segments, detected_language = _run_whisper(audio_path, language, max_words)
    diarization_segments = _run_diarization(audio_path, num_speakers, min_speakers, max_speakers)
    merged = _merge(whisper_segments, diarization_segments)

    # Attach detected language to the first segment so callers can inspect it
    if merged and detected_language:
        merged[0]["language"] = detected_language

    return merged


# ── Private helpers ───────────────────────────────────────────────────────────

def _run_whisper(
    audio_path: str,
    language: str | None,
    max_words: int = 4,
) -> tuple[list[dict], str | None]:
    model = get_whisper_model()

    # Word timestamps are needed to split each segment into max_words-sized rows.
    chunk_words = max_words is not None and max_words > 0
    kwargs: dict = {"beam_size": 5, "word_timestamps": chunk_words}
    if language:
        kwargs["language"] = language

    logger.info(
        "Transcribing %s with faster-whisper (language=%r, max_words=%s)…",
        audio_path,
        language,
        max_words,
    )
    segments_iter, info = model.transcribe(audio_path, **kwargs)

    segments: list[dict] = []
    for seg in segments_iter:
        words = getattr(seg, "words", None) or []
        if chunk_words and words:
            # Split the segment into consecutive rows of at most max_words words,
            # carrying the first/last word's timing as the row's start/end.
            for i in range(0, len(words), max_words):
                chunk = words[i : i + max_words]
                text = "".join(w.word for w in chunk).strip()
                if text:
                    segments.append({"start": chunk[0].start, "end": chunk[-1].end, "text": text})
        else:
            text = seg.text.strip()
            if text:
                segments.append({"start": seg.start, "end": seg.end, "text": text})

    logger.info(
        "Whisper done: %d rows, detected language='%s' (prob=%.2f)",
        len(segments),
        info.language,
        info.language_probability,
    )
    return segments, info.language


def _run_diarization(
    audio_path: str,
    num_speakers: int | None,
    min_speakers: int | None,
    max_speakers: int | None,
) -> list[dict]:
    pipeline = get_diarization_pipeline()

    kwargs: dict = {}
    if num_speakers is not None:
        kwargs["num_speakers"] = num_speakers
    else:
        if min_speakers is not None:
            kwargs["min_speakers"] = min_speakers
        if max_speakers is not None:
            kwargs["max_speakers"] = max_speakers

    logger.info("Running diarization for transcription merge (kwargs=%s)…", kwargs)
    diarization = pipeline(audio_path, **kwargs)

    segments = [
        {"speaker": speaker, "start": turn.start, "end": turn.end}
        for turn, _, speaker in diarization.itertracks(yield_label=True)
    ]
    logger.info("Diarization done: %d segments", len(segments))
    return segments


def _merge(whisper_segments: list[dict], diarization_segments: list[dict]) -> list[dict]:
    """
    Assign each Whisper segment to the speaker with the greatest temporal overlap.
    Falls back to 'UNKNOWN' when there is no overlap with any diarization segment.
    """
    result = []
    for ws in whisper_segments:
        best_speaker = "UNKNOWN"
        best_overlap = 0.0
        for ds in diarization_segments:
            overlap = max(0.0, min(ws["end"], ds["end"]) - max(ws["start"], ds["start"]))
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = ds["speaker"]

        result.append({
            "speaker": best_speaker,
            "start": round(ws["start"], 3),
            "end": round(ws["end"], 3),
            "text": ws["text"],
        })

    return result
