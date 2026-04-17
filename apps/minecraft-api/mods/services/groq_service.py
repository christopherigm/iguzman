import json

import httpx
from django.conf import settings

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

SYSTEM_PROMPT = """You are an expert Minecraft mod developer specialising in Kotlin and the Architectury API.
Your job is to generate a Minecraft 1.21.4 mod based on the user's description.

Return ONLY a valid JSON object — no markdown, no code fences, no explanation outside the JSON.

Required JSON structure:
{
  "modId": "snake_case_id_max_64_chars",
  "modName": "Human Readable Name",
  "description": "One sentence description of the mod",
  "mainClass": "PascalCaseClassName",
  "sources": [
    {
      "path": "common/src/main/kotlin/com/iguzman/mod/PascalCaseClassName.kt",
      "content": "..."
    }
  ]
}

Rules:
- modId: lowercase, only letters/digits/underscores, max 64 chars.
- mainClass: PascalCase, must match the primary Kotlin object name.
- Package for all sources: com.iguzman.mod (common code only).
- The primary file MUST define: object {mainClass} { const val MOD_ID = "{modId}"; fun init() { ... } }
- Only generate files under common/src/main/kotlin/ — do NOT generate fabric or neoforge entrypoints.
- Use Architectury API for cross-platform features (events, registries, platform checks).
- Use idiomatic Kotlin (objects, extension functions, scope functions).
- Target Minecraft 1.21.4 with Architectury API 13.x.
- Keep the code minimal and focused on the user's request.
"""


def generate_mod_code(prompt: str, model: str = "llama-3.3-70b-versatile") -> dict:
    """
    Call the Groq API and return the parsed mod metadata + sources dict.

    Raises:
        httpx.HTTPStatusError: on non-2xx Groq response
        json.JSONDecodeError: if the model returns malformed JSON
        KeyError: if required fields are missing from the response
    """
    api_key = settings.GROQ_API_KEY

    with httpx.Client(timeout=120.0) as client:
        response = client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 8000,
                "response_format": {"type": "json_object"},
            },
        )
        response.raise_for_status()

    content = response.json()["choices"][0]["message"]["content"]
    data = json.loads(content)

    # Basic validation before handing off to compile pipeline
    for field in ("modId", "modName", "mainClass", "sources"):
        if not data.get(field):
            raise ValueError(f"LLM response missing required field: '{field}'")

    if not isinstance(data["sources"], list) or len(data["sources"]) == 0:
        raise ValueError("LLM response 'sources' must be a non-empty list")

    return data
