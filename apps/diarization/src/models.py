"""
Singleton model registry.

Both the pyannote diarization pipeline and the faster-whisper model are loaded
once at application startup and reused across requests.
"""

import logging
import os

logger = logging.getLogger(__name__)

HF_TOKEN = os.getenv("HF_TOKEN", "")
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")

# Module-level singletons
_diarization_pipeline = None
_whisper_model = None


def load_models() -> None:
    """Load all models. Called once during application lifespan startup."""
    global _diarization_pipeline, _whisper_model

    if not HF_TOKEN:
        raise RuntimeError(
            "HF_TOKEN environment variable is required to download pyannote models. "
            "Accept the model terms at https://huggingface.co/pyannote/speaker-diarization-3.1 "
            "and https://huggingface.co/pyannote/segmentation-3.0, then set HF_TOKEN to your "
            "HuggingFace access token."
        )

    _diarization_pipeline = _load_diarization_pipeline()
    _whisper_model = _load_whisper_model()


def _load_diarization_pipeline():
    from pyannote.audio import Pipeline

    logger.info("Loading pyannote/speaker-diarization-3.1…")
    # huggingface_hub reads HF_TOKEN from the environment automatically.
    # Passing use_auth_token explicitly as well for older huggingface_hub versions.
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=HF_TOKEN,
    )
    logger.info("Pyannote diarization pipeline ready.")
    return pipeline


def _load_whisper_model():
    from faster_whisper import WhisperModel

    logger.info("Loading faster-whisper model '%s' (CPU / int8)…", WHISPER_MODEL_SIZE)
    model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
    logger.info("Whisper model ready.")
    return model


def get_diarization_pipeline():
    if _diarization_pipeline is None:
        raise RuntimeError("Diarization pipeline is not loaded. Check startup logs.")
    return _diarization_pipeline


def get_whisper_model():
    if _whisper_model is None:
        raise RuntimeError("Whisper model is not loaded. Check startup logs.")
    return _whisper_model
