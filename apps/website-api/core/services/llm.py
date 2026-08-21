"""Centralized LLM access for website-api.

Every AI call in the website stack goes through here: the admin CMS talks to
`/api/ai/chat/`, which streams from this module.

OpenRouter is the only provider. Groq used to be the primary and OpenRouter the
fallback, but Groq's free tier kept exhausting its tokens-per-day allowance
mid-workday (429 `rate_limit_exceeded`), so every call fell through to OpenRouter
anyway - at the cost of a wasted round-trip and a misleading warning in the logs.
"""
import json
from collections.abc import Iterator

from django.conf import settings
from openai import OpenAI


class LlmNotConfigured(Exception):
    """No API key is set - a deployment problem, not a runtime one."""


def _client() -> OpenAI:
    """An OpenAI-SDK client pointed at OpenRouter's OpenAI-compatible endpoint."""
    return OpenAI(
        base_url='https://openrouter.ai/api/v1',
        api_key=settings.OPENROUTER_API_KEY,
        timeout=settings.LLM_REQUEST_TIMEOUT,
    )


def stream_chat(messages: list[dict], temperature: float = 0.7) -> Iterator[str]:
    """Yield text tokens from OpenRouter.

    There is no second provider to fall back to: a provider failure propagates to
    the caller, which for `AiChatView` means the error is reported inside the SSE
    stream (the 200 is already committed by then).
    """
    if not settings.OPENROUTER_API_KEY:
        raise LlmNotConfigured('OPENROUTER_API_KEY is unset.')

    completion = _client().chat.completions.create(
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


def chat_json(messages: list[dict], temperature: float = 0.0) -> dict:
    """Return a JSON object from the LLM.

    Unlike `stream_chat`, this is a single non-streaming request: the caller wants
    the whole structured object (e.g. an extracted nutrition table), not tokens.

    The prompt must instruct the model to return a JSON object; `response_format`
    enforces the shape but not the keys. Raises `LlmNotConfigured` when no key is
    set, and propagates provider and JSON-parse errors to the caller.
    """
    if not settings.OPENROUTER_API_KEY:
        raise LlmNotConfigured('OPENROUTER_API_KEY is unset.')

    completion = _client().chat.completions.create(
        model=settings.OPENROUTER_MODEL,
        messages=messages,
        temperature=temperature,
        response_format={'type': 'json_object'},
    )
    content = completion.choices[0].message.content or '{}'
    return json.loads(content)
