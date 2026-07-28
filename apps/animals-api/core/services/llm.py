"""Centralized LLM access for animals-api.

Every AI call in this backend goes through here - the `/api/ai/*` endpoints in
`core.ai_views` are its only callers. Groq is the primary provider and OpenRouter
the fallback, ported unchanged from `website-api/core/services/llm.py`; keep the
two in step rather than letting them drift.

Two entry points, for two different shapes of answer:

* ``stream_chat`` yields tokens, for anything a human watches appear (the
  translate/enhance buttons a CMS would drive over SSE).
* ``chat_json`` returns one parsed object, for anything code consumes (a
  field map extracted from web search results).

There is deliberately no provider argument: which provider serves a request is a
backend decision, never a caller's.
"""
import json
import logging
from collections.abc import Iterator

from django.conf import settings
from groq import Groq
from openai import OpenAI

logger = logging.getLogger(__name__)


class LlmNotConfigured(Exception):
    """Neither provider has an API key - a deployment problem, not a runtime one."""


def is_configured() -> bool:
    """Whether any provider can serve a request.

    Views call this *before* opening a streaming response: once the first chunk
    is written the 200 is committed, and a missing key could then only be
    reported inside the stream.
    """
    return bool(settings.GROQ_API_KEY or settings.OPENROUTER_API_KEY)


def _groq_client() -> Groq:
    return Groq(api_key=settings.GROQ_API_KEY, timeout=settings.LLM_REQUEST_TIMEOUT)


def _openrouter_client() -> OpenAI:
    return OpenAI(
        base_url='https://openrouter.ai/api/v1',
        api_key=settings.OPENROUTER_API_KEY,
        timeout=settings.LLM_REQUEST_TIMEOUT,
    )


def _groq_stream(messages: list[dict], temperature: float) -> Iterator[str]:
    completion = _groq_client().chat.completions.create(
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
    completion = _openrouter_client().chat.completions.create(
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
    if not is_configured():
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


def _chat_json_once(client, model: str, messages: list[dict], temperature: float) -> dict:
    """One non-streaming JSON-mode completion, parsed into a dict.

    Both Groq and OpenRouter expose the OpenAI-compatible `response_format`
    JSON-object mode, so the same call shape works for either client.
    """
    completion = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        response_format={'type': 'json_object'},
    )
    content = completion.choices[0].message.content or '{}'
    return json.loads(content)


def chat_json(messages: list[dict], temperature: float = 0.0) -> dict:
    """Return a JSON object from the LLM, Groq first and OpenRouter as fallback.

    Unlike `stream_chat`, this is a single non-streaming request: the caller wants
    the whole structured object (e.g. an extracted set of species fields), not
    tokens. Any Groq failure - a provider error *or* a response that isn't valid
    JSON - falls back to OpenRouter, since nothing has been shown to the user yet.

    The prompt must instruct the model to return a JSON object; `response_format`
    enforces the shape but not the keys. Raises `LlmNotConfigured` when neither
    provider has a key, and propagates the final provider/parse error when the
    fallback also fails.
    """
    if not is_configured():
        raise LlmNotConfigured('GROQ_API_KEY and OPENROUTER_API_KEY are both unset.')

    if settings.GROQ_API_KEY:
        try:
            return _chat_json_once(_groq_client(), settings.GROQ_MODEL, messages, temperature)
        except Exception as e:
            logger.warning('Groq JSON call failed (%s); falling back to OpenRouter', e)

    if not settings.OPENROUTER_API_KEY:
        raise LlmNotConfigured('Groq is unavailable and OPENROUTER_API_KEY is unset.')

    return _chat_json_once(
        _openrouter_client(), settings.OPENROUTER_MODEL, messages, temperature
    )
