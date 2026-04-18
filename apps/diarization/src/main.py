import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile

import models
from diarize import run_diarization
from transcribe import run_transcription_with_diarization

# ── Logging ──────────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "info").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
API_KEY = os.getenv("API_KEY", "")
MAX_FILE_BYTES = 100 * 1024 * 1024  # 100 MB
SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".mp4", ".m4a", ".flac", ".ogg", ".webm"}


# ── Lifespan (load models once at startup) ────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading models – this may take several minutes on first run…")
    models.load_models()
    logger.info("All models ready.")
    yield


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Diarization Service",
    description="Speaker diarization and transcription via pyannote.audio + faster-whisper",
    version="0.1.0",
    lifespan=lifespan,
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


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


@app.post(
    "/diarize",
    tags=["diarization"],
    dependencies=[Depends(verify_api_key)],
    summary="Speaker diarization (no transcription)",
    response_description="List of speaker segments with start/end timestamps",
)
async def diarize(
    file: UploadFile = File(..., description="Audio file (wav, mp3, mp4, m4a, flac, ogg, webm)"),
    num_speakers: int | None = Form(default=None, description="Exact expected number of speakers"),
    min_speakers: int | None = Form(default=None, description="Minimum expected number of speakers"),
    max_speakers: int | None = Form(default=None, description="Maximum expected number of speakers"),
):
    """
    Upload an audio file and receive a list of speaker segments.

    Each segment contains `speaker` (e.g. `SPEAKER_00`), `start`, and `end` (seconds).
    Optionally constrain the number of speakers for better accuracy.
    """
    audio_path = await save_upload(file)
    try:
        segments = run_diarization(
            audio_path,
            num_speakers=num_speakers,
            min_speakers=min_speakers,
            max_speakers=max_speakers,
        )
        return {"segments": segments}
    finally:
        Path(audio_path).unlink(missing_ok=True)


@app.post(
    "/transcribe",
    tags=["transcription"],
    dependencies=[Depends(verify_api_key)],
    summary="Speaker-attributed transcription",
    response_description="List of segments with speaker, timestamps, and transcribed text",
)
async def transcribe(
    file: UploadFile = File(..., description="Audio file (wav, mp3, mp4, m4a, flac, ogg, webm)"),
    language: str | None = Form(default=None, description="BCP-47 language code (e.g. 'en', 'es'). Auto-detected if omitted."),
    num_speakers: int | None = Form(default=None, description="Exact expected number of speakers"),
    min_speakers: int | None = Form(default=None, description="Minimum expected number of speakers"),
    max_speakers: int | None = Form(default=None, description="Maximum expected number of speakers"),
):
    """
    Upload an audio file and receive a speaker-attributed transcript.

    Runs pyannote diarization and faster-whisper transcription in parallel, then merges
    the results by temporal overlap.  Each segment contains `speaker`, `start`, `end`,
    and `text`.
    """
    audio_path = await save_upload(file)
    try:
        result = run_transcription_with_diarization(
            audio_path,
            language=language,
            num_speakers=num_speakers,
            min_speakers=min_speakers,
            max_speakers=max_speakers,
        )
        return {"segments": result, "language": result[0].get("language") if result else None}
    finally:
        Path(audio_path).unlink(missing_ok=True)
