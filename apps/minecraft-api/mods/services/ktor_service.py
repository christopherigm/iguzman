import httpx
from django.conf import settings


def compile_mod(payload: dict) -> dict:
    """
    POST the mod metadata + sources to the minecraft-ktor compile service.

    Args:
        payload: dict matching the Ktor CompileRequest schema:
            {
                "modId": str,
                "modName": str,
                "version": str,
                "description": str,
                "mainClass": str,
                "sources": [{"path": str, "content": str}, ...]
            }

    Returns:
        dict matching the Ktor CompileResult schema:
            {
                "success": bool,
                "fabricJarBase64": str | None,
                "neoforgeJarBase64": str | None,
                "buildLog": str | None,
                "error": str | None,
            }

    Raises:
        httpx.HTTPStatusError: on non-2xx response from the compile service
        httpx.TimeoutException: if the build exceeds the client timeout
    """
    ktor_url = settings.KTOR_SERVICE_URL.rstrip("/")

    # 10-minute client timeout — Gradle builds can take up to ~90 s on warm cache,
    # longer on first run or if the cache is cold.
    with httpx.Client(timeout=600.0) as client:
        response = client.post(f"{ktor_url}/compile", json=payload)
        # 200 = success; 422 = compile failed but the body contains buildLog/error details.
        # Only raise for truly unexpected responses (4xx other than 422, 5xx).
        if response.status_code not in (200, 422):
            response.raise_for_status()
        return response.json()
