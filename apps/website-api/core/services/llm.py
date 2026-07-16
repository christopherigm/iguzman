"""Centralized LLM access for website-api.

Every AI call in the website stack goes through here: the admin CMS talks to
`/api/ai/chat/`, which streams from this module. Groq is the primary provider and
OpenRouter the fallback, mirroring `cinelog-api/catalog/services/llm.py`.
"""
import logging
from collections.abc import Iterator

from django.conf import settings
from groq import Groq
from openai import OpenAI

logger = logging.getLogger(__name__)


class LlmNotConfigured(Exception):
    """Neither provider has an API key - a deployment problem, not a runtime one."""


def _groq_stream(messages: list[dict], temperature: float) -> Iterator[str]:
    client = Groq(api_key=settings.GROQ_API_KEY, timeout=settings.LLM_REQUEST_TIMEOUT)
    completion = client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        temperature=temperature,
        stream=True,
    )
    for chunk in completion:
        token = chunk.choices[0].delta.content
        if token:
            yield token


def _openrouter_stream(messages: list[dict], temperature: float) -> Iterator[str]:
    client = OpenAI(
        base_url='https://openrouter.ai/api/v1',
        api_key=settings.OPENROUTER_API_KEY,
        timeout=settings.LLM_REQUEST_TIMEOUT,
    )
    completion = client.chat.completions.create(
        model=settings.OPENROUTER_MODEL,
        messages=messages,
        temperature=temperature,
        stream=True,
    )
    for chunk in completion:
        # OpenRouter emits keep-alive chunks with no choices while a slow provider warms up.
        if not chunk.choices:
            continue
        token = chunk.choices[0].delta.content
        if token:
            yield token


def stream_chat(messages: list[dict], temperature: float = 0.7) -> Iterator[str]:
    """Yield text tokens from Groq, falling back to OpenRouter on any Groq failure.

    The fallback only covers failures that happen *before the first token*: once
    Groq has emitted content the caller has already shown it, so restarting on
    another provider would duplicate the output. A mid-stream failure therefore
    propagates to the caller instead.

    An empty Groq stream counts as a failure - it is indistinguishable from a
    broken response to the caller, and OpenRouter may well have content.
    """
    if not settings.GROQ_API_KEY and not settings.OPENROUTER_API_KEY:
        raise LlmNotConfigured('GROQ_API_KEY and OPENROUTER_API_KEY are both unset.')

    first: str | None = None
    groq_stream: Iterator[str] | None = None

    if settings.GROQ_API_KEY:
        try:
            groq_stream = _groq_stream(messages, temperature)
            first = next(groq_stream, None)
        except Exception as e:
            logger.warning('Groq failed before first token (%s); falling back to OpenRouter', e)
            groq_stream = None

    if groq_stream is not None and first is not None:
        yield first
        yield from groq_stream
        return

    if groq_stream is not None:
        logger.warning('Groq returned an empty stream; falling back to OpenRouter')

    if not settings.OPENROUTER_API_KEY:
        raise LlmNotConfigured('Groq is unavailable and OPENROUTER_API_KEY is unset.')

    yield from _openrouter_stream(messages, temperature)
