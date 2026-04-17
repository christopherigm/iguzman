import base64
import threading

from django.core.files.base import ContentFile
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Mod, ModStatus
from .serializers import ModCreateSerializer, ModSerializer
from .services.groq_service import generate_mod_code
from .services.ktor_service import compile_mod

CACHE_TTL = 60  # 1 minute — status changes frequently during pipeline


# ─── Background pipeline ─────────────────────────────────────────────────────

def _run_pipeline(mod_pk: int) -> None:
    """
    Execute the full generation + compilation pipeline in a background thread.

    Steps:
      1. Call Groq to generate Kotlin sources from the prompt.
      2. Call minecraft-ktor to compile the sources into .jar files.
      3. Save the .jar files to media/ and mark the Mod as ready.
    """
    # Import inside function to avoid AppRegistryNotReady at module load time
    from django.core.cache import cache

    mod = Mod.objects.get(pk=mod_pk)

    def _save_status(s: str, **fields):
        mod.status = s
        for k, v in fields.items():
            setattr(mod, k, v)
        update_fields = ['status', 'modified'] + list(fields.keys())
        mod.save(update_fields=update_fields)

    try:
        # ── Step 1: LLM code generation ──────────────────────────────────────
        _save_status(ModStatus.GENERATING)

        code_data = generate_mod_code(mod.prompt, model=mod.llm_model)

        mod.mod_id = code_data['modId']
        mod.mod_name = code_data['modName']
        mod.description = code_data.get('description', '')
        mod.main_class = code_data['mainClass']
        mod.generated_sources = code_data['sources']
        mod.status = ModStatus.COMPILING
        mod.save(update_fields=[
            'mod_id', 'mod_name', 'description', 'main_class',
            'generated_sources', 'status', 'modified',
        ])

        # ── Step 2: Compile via minecraft-ktor ───────────────────────────────
        compile_result = compile_mod({
            'modId': mod.mod_id,
            'modName': mod.mod_name,
            'version': '1.0.0',
            'description': mod.description,
            'mainClass': mod.main_class,
            'sources': mod.generated_sources,
        })

        mod.build_log = compile_result.get('buildLog', '')

        if not compile_result.get('success'):
            raise RuntimeError(
                compile_result.get('error', 'Compilation failed — no error detail provided.')
            )

        # ── Step 3: Persist .jar artifacts ───────────────────────────────────
        if fabric_b64 := compile_result.get('fabricJarBase64'):
            mod.fabric_jar.save(
                f"{mod.mod_id}-fabric-1.0.0.jar",
                ContentFile(base64.b64decode(fabric_b64)),
                save=False,
            )

        if neoforge_b64 := compile_result.get('neoforgeJarBase64'):
            mod.neoforge_jar.save(
                f"{mod.mod_id}-neoforge-1.0.0.jar",
                ContentFile(base64.b64decode(neoforge_b64)),
                save=False,
            )

        mod.status = ModStatus.READY
        mod.error = ''
        mod.save()

    except Exception as exc:  # noqa: BLE001
        mod.status = ModStatus.FAILED
        mod.error = str(exc)
        mod.save(update_fields=['status', 'error', 'build_log', 'modified'])

    finally:
        # Invalidate cached detail so the next poll returns fresh state
        cache.delete(f"mods:mod:{mod_pk}")


# ─── Views ────────────────────────────────────────────────────────────────────

class ModListCreateView(APIView):
    """
    GET  /api/mods/  — list the authenticated user's mods.
    POST /api/mods/  — submit a prompt; kicks off generation + compilation in background.
                       Returns 202 Accepted immediately with the Mod id and initial state.
    """

    def get(self, request):
        mods = Mod.objects.filter(user=request.user)
        serializer = ModSerializer(mods, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request):
        serializer = ModCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        mod = Mod.objects.create(
            user=request.user,
            prompt=serializer.validated_data['prompt'],
            llm_model=serializer.validated_data.get('llm_model', 'llama-3.3-70b-versatile'),
        )

        thread = threading.Thread(target=_run_pipeline, args=(mod.pk,), daemon=True)
        thread.start()

        return Response(
            ModSerializer(mod, context={'request': request}).data,
            status=status.HTTP_202_ACCEPTED,
        )


class ModDetailView(APIView):
    """
    GET /api/mods/{id}/  — return current status and download URLs for a mod.
    """

    def get(self, request, pk):
        from django.core.cache import cache

        cache_key = f"mods:mod:{pk}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        try:
            mod = Mod.objects.get(pk=pk, user=request.user)
        except Mod.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        data = ModSerializer(mod, context={'request': request}).data

        # Only cache terminal states; pending/generating/compiling change rapidly
        if mod.status in (ModStatus.READY, ModStatus.FAILED):
            cache.set(cache_key, data, CACHE_TTL)

        return Response(data)
