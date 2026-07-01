import logging

import groq as _groq_module
import instructor
from django.conf import settings
from groq import Groq
from openai import OpenAI

logger = logging.getLogger(__name__)


def _caused_by_rate_limit(exc: BaseException) -> bool:
    cause: BaseException | None = exc
    while cause is not None:
        if isinstance(cause, _groq_module.RateLimitError):
            return True
        cause = cause.__cause__ or cause.__context__
    return False


def _openrouter_client() -> instructor.Instructor:
    # Use TOOLS (function-calling) mode rather than JSON mode: reasoning models
    # served by generic OpenRouter providers leak their chain-of-thought into the
    # message content under plain JSON mode, which breaks schema parsing. Tool
    # calls force a structured argument payload instead.
    return instructor.from_openai(
        OpenAI(
            base_url='https://openrouter.ai/api/v1',
            api_key=settings.OPENROUTER_API_KEY,
            timeout=settings.LLM_REQUEST_TIMEOUT,
        ),
        mode=instructor.Mode.TOOLS,
    )


# Restrict OpenRouter routing to providers that actually support every request
# parameter we send (i.e. tool calling). Without this, OpenRouter may route to a
# provider that silently ignores the tools schema and returns malformed output.
_OPENROUTER_EXTRA_BODY = {'provider': {'require_parameters': True}}


def chat_structured(
    messages: list[dict],
    response_model: type,
    temperature: float = 0.3,
    max_retries: int = 2,
):
    """Call Groq with Instructor schema enforcement, fall back to OpenRouter on rate-limit."""
    groq_client = instructor.from_groq(
        Groq(api_key=settings.GROQ_API_KEY, timeout=settings.LLM_REQUEST_TIMEOUT),
        mode=instructor.Mode.JSON,
    )
    try:
        return groq_client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=messages,
            response_model=response_model,
            temperature=temperature,
            max_retries=max_retries,
        )
    except Exception as e:
        if not _caused_by_rate_limit(e):
            raise
        logger.warning('Groq rate limit reached; falling back to OpenRouter')

    return _openrouter_client().chat.completions.create(
        model=settings.OPENROUTER_MODEL,
        messages=messages,
        response_model=response_model,
        temperature=temperature,
        max_retries=max_retries,
        extra_body=_OPENROUTER_EXTRA_BODY,
    )


def chat_text(messages: list[dict], temperature: float = 0.5) -> str:
    """Plain text generation with Groq → OpenRouter fallback."""
    groq_client = Groq(api_key=settings.GROQ_API_KEY, timeout=settings.LLM_REQUEST_TIMEOUT)
    try:
        response = groq_client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=messages,
            temperature=temperature,
        )
        return response.choices[0].message.content
    except Exception as e:
        if not _caused_by_rate_limit(e):
            raise
        logger.warning('Groq rate limit reached; falling back to OpenRouter')

    openrouter = OpenAI(
        base_url='https://openrouter.ai/api/v1',
        api_key=settings.OPENROUTER_API_KEY,
        timeout=settings.LLM_REQUEST_TIMEOUT,
    )
    response = openrouter.chat.completions.create(
        model=settings.OPENROUTER_MODEL,
        messages=messages,
        temperature=temperature,
    )
    return response.choices[0].message.content
