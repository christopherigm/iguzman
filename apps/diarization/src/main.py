import asyncio
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import models
from jobs import create_job, ensure_indexes, get_job
from worker import enqueue, run_worker

# ── Logging ──────────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "info").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)


class _NoHealthFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "GET /health" not in record.getMessage()


logging.getLogger("uvicorn.access").addFilter(_NoHealthFilter())

# ── Config ────────────────────────────────────────────────────────────────────
API_KEY = os.getenv("API_KEY", "")
MAX_FILE_BYTES = 100 * 1024 * 1024  # 100 MB
SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".mp4", ".m4a", ".flac", ".ogg", ".webm"}


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    logger.info("Loading models - this may take several minutes on first run…")
    models.load_models()
    logger.info("All models ready.")
    worker_task = asyncio.create_task(run_worker())
    yield
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Diarization Service",
    description="Speaker diarization and transcription via pyannote.audio + faster-whisper",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["X-API-Key", "Content-Type"],
)


# ── Auth ──────────────────────────────────────────────────────────────────────
def verify_api_key(x_api_key: str = Header(default=None)) -> None:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Helpers ───────────────────────────────────────────────────────────────────
async def save_upload(file: UploadFile) -> str:
    """Validate and persist an uploaded audio file to a temp path."""
    ext = Path(file.filename or "audio.wav").suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Accepted: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 100 MB)")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.write(data)
    tmp.close()
    return tmp.name


def _job_response(job: dict) -> dict:
    """Strip internal payload before returning job state to the client."""
    return {
        "job_id": job["id"],
        "status": job["status"],
        "result": job.get("result"),
        "error": job.get("error"),
        "created_at": job.get("created_at"),
    }


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


@app.get(
    "/jobs/{job_id}",
    tags=["jobs"],
    dependencies=[Depends(verify_api_key)],
    summary="Poll job status",
    response_description="Current job status, and result/error when finished",
)
async def get_job_status(job_id: str):
    """
    Poll for the result of a previously submitted `/diarize` or `/transcribe` job.

    - **queued** - waiting to be picked up
    - **running** - currently processing
    - **done** - `result` field contains the output
    - **error** - `error` field contains the failure message
    """
    job = await get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found (may have expired)")
    return _job_response(job)


@app.post(
    "/diarize",
    tags=["diarization"],
    dependencies=[Depends(verify_api_key)],
    summary="Submit speaker diarization job",
    response_description="Job ID to poll via GET /jobs/{job_id}",
    status_code=202,
)
async def diarize(
    file: UploadFile = File(..., description="Audio file (wav, mp3, mp4, m4a, flac, ogg, webm)"),
    num_speakers: int | None = Form(default=None, description="Exact expected number of speakers"),
    min_speakers: int | None = Form(default=None, description="Minimum expected number of speakers"),
    max_speakers: int | None = Form(default=None, description="Maximum expected number of speakers"),
):
    """
    Upload an audio file to start diarization. Returns a job ID immediately.

    Poll `GET /jobs/{job_id}` to retrieve the result. When done, `result.segments`
    contains a list of `{speaker, start, end}` dicts.
    """
    audio_path = await save_upload(file)
    job_id = await create_job("diarize", {
        "audio_path": audio_path,
        "num_speakers": num_speakers,
        "min_speakers": min_speakers,
        "max_speakers": max_speakers,
    })
    await enqueue(job_id)
    return {"job_id": job_id, "status": "queued"}


@app.post(
    "/transcribe",
    tags=["transcription"],
    dependencies=[Depends(verify_api_key)],
    summary="Submit speaker-attributed transcription job",
    response_description="Job ID to poll via GET /jobs/{job_id}",
    status_code=202,
)
async def transcribe(
    file: UploadFile = File(..., description="Audio file (wav, mp3, mp4, m4a, flac, ogg, webm)"),
    language: str | None = Form(default=None, description="BCP-47 language code (e.g. 'en', 'es'). Auto-detected if omitted."),
    num_speakers: int | None = Form(default=None, description="Exact expected number of speakers"),
    min_speakers: int | None = Form(default=None, description="Minimum expected number of speakers"),
    max_speakers: int | None = Form(default=None, description="Maximum expected number of speakers"),
    max_words: int = Form(default=4, ge=1, le=10, description="Maximum number of words per subtitle row (1-10). Defaults to 4."),
):
    """
    Upload an audio file to start speaker-attributed transcription. Returns a job ID immediately.

    Poll `GET /jobs/{job_id}` to retrieve the result. When done, `result.segments`
    contains a list of `{speaker, start, end, text}` dicts, and `result.language`
    contains the detected language code.
    """
    audio_path = await save_upload(file)
    job_id = await create_job("transcribe", {
        "audio_path": audio_path,
        "language": language,
        "num_speakers": num_speakers,
        "min_speakers": min_speakers,
        "max_speakers": max_speakers,
        "max_words": max_words,
    })
    await enqueue(job_id)
    return {"job_id": job_id, "status": "queued"}
