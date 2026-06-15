"""
Serial job worker - processes one diarization/transcription job at a time
to avoid CPU/GPU contention.
"""

import asyncio
import functools
import logging
from pathlib import Path

from diarize import run_diarization
from jobs import get_job, update_job
from preprocess import preprocess_audio
from transcribe import run_transcription_with_diarization

logger = logging.getLogger(__name__)

_queue: asyncio.Queue[str] = asyncio.Queue()


def get_queue() -> asyncio.Queue[str]:
    return _queue


async def enqueue(job_id: str) -> None:
    await _queue.put(job_id)


async def run_worker() -> None:
    logger.info("Job worker started")
    loop = asyncio.get_event_loop()

    while True:
        job_id = await _queue.get()
        job = await get_job(job_id)
        if job is None:
            _queue.task_done()
            continue

        audio_path: str | None = job["payload"].get("audio_path")
        wav_path: str | None = None

        try:
            await update_job(job_id, status="running")

            wav_path = await loop.run_in_executor(None, preprocess_audio, audio_path)

            payload = job["payload"]
            speaker_kwargs = {
                k: payload[k]
                for k in ("num_speakers", "min_speakers", "max_speakers")
                if payload.get(k) is not None
            }

            if job["type"] == "diarize":
                fn = functools.partial(run_diarization, wav_path, **speaker_kwargs)
                segments = await loop.run_in_executor(None, fn)
                result = {"segments": segments}

            else:  # transcribe
                fn = functools.partial(
                    run_transcription_with_diarization,
                    wav_path,
                    language=payload.get("language"),
                    **speaker_kwargs,
                )
                segments = await loop.run_in_executor(None, fn)
                result = {
                    "segments": segments,
                    "language": segments[0].get("language") if segments else None,
                }

            await update_job(job_id, status="done", result=result)
            logger.info("Job %s completed successfully", job_id)

        except Exception:
            logger.exception("Job %s failed", job_id)
            await update_job(job_id, status="error", error="Processing failed - check service logs for details")

        finally:
            if audio_path:
                Path(audio_path).unlink(missing_ok=True)
            if wav_path:
                Path(wav_path).unlink(missing_ok=True)
            _queue.task_done()
