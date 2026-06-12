FROM python:3.11-slim

# ffmpeg  - audio decoding (mp3, m4a, webm, etc.)
# libsndfile1 - required by soundfile / pyannote
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY apps/diarization/requirements.txt .

RUN pip install --no-cache-dir \
    torch==2.4.1 \
    torchaudio==2.4.1 \
    --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir -r requirements.txt

COPY apps/diarization/src/ ./src/

EXPOSE 8000
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app/src

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
