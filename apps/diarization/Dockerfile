FROM python:3.11-slim

# ── System dependencies ────────────────────────────────────────────────────────
# ffmpeg  – audio decoding (mp3, m4a, webm, etc.)
# libsndfile1 – required by soundfile / pyannote
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python dependencies ────────────────────────────────────────────────────────
COPY requirements.txt .

# Install CPU-only PyTorch first to avoid pulling the much larger CUDA wheels
# that pyannote would otherwise pull as a transitive dependency.
RUN pip install --no-cache-dir \
    torch==2.4.1 \
    torchaudio==2.4.1 \
    --index-url https://download.pytorch.org/whl/cpu

# Install the rest of the dependencies
RUN pip install --no-cache-dir -r requirements.txt

# ── Application source ────────────────────────────────────────────────────────
COPY src/ ./src/

# ── Runtime ───────────────────────────────────────────────────────────────────
EXPOSE 8000
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Run from src/ so that sibling module imports (models, diarize, transcribe)
# resolve without a package prefix.
WORKDIR /app/src

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
