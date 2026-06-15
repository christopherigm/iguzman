"""
MongoDB-backed job store for async diarization/transcription tasks.
"""

import logging
import os
import uuid
from datetime import datetime, timezone

import motor.motor_asyncio
from pymongo import ASCENDING

logger = logging.getLogger(__name__)

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
JOB_TTL = 3600  # seconds - MongoDB TTL index auto-deletes after this

_collection: motor.motor_asyncio.AsyncIOMotorCollection | None = None


def _get_collection() -> motor.motor_asyncio.AsyncIOMotorCollection:
    global _collection
    if _collection is None:
        client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URL)
        _collection = client["diarization"]["jobs"]
    return _collection


async def ensure_indexes() -> None:
    col = _get_collection()
    await col.create_index(
        [("created_at", ASCENDING)],
        expireAfterSeconds=JOB_TTL,
        name="ttl_created_at",
    )
    logger.info("MongoDB indexes ensured")


async def create_job(job_type: str, payload: dict) -> str:
    job_id = str(uuid.uuid4())
    await _get_collection().insert_one({
        "_id": job_id,
        "type": job_type,
        "status": "queued",
        "payload": payload,
        "result": None,
        "error": None,
        "created_at": datetime.now(timezone.utc),
    })
    logger.info("Created job %s (type=%s)", job_id, job_type)
    return job_id


async def get_job(job_id: str) -> dict | None:
    doc = await _get_collection().find_one({"_id": job_id})
    if doc is None:
        return None
    doc["id"] = doc.pop("_id")
    return doc


async def update_job(job_id: str, **fields) -> None:
    await _get_collection().update_one({"_id": job_id}, {"$set": fields})
