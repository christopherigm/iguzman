package com.iguzman.minecraft.services

import com.iguzman.minecraft.models.CompileRequest
import com.iguzman.minecraft.models.CompileResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.slf4j.LoggerFactory
import java.io.File
import java.util.Base64
import java.util.UUID
import java.util.concurrent.TimeUnit

class CompileService(
    private val templateDir: String,
    private val gradleHome: String,
    private val workspaceDir: String,
    private val timeoutSeconds: Long = 600,
) {
    private val log = LoggerFactory.getLogger(CompileService::class.java)

    suspend fun compile(request: CompileRequest): CompileResult = withContext(Dispatchers.IO) {
        val buildId = UUID.randomUUID().toString()
        val buildDir = File(workspaceDir, buildId)

        log.info("Starting build {} for mod '{}'", buildId, request.modId)

        try {
            // 1. Copy the Architectury template into a fresh workspace
            File(templateDir).copyRecursively(buildDir, overwrite = true)

            // 2. Write mod-specific gradle.properties (overrides template defaults)
            writeGradleProperties(buildDir, request)

            // 3. Generate Minecraft resource files from request metadata
            generateFabricModJson(buildDir, request)
            generateNeoForgeMods(buildDir, request)
            generatePackMcMeta(buildDir, request)

            // 4. Inject LLM-generated source files
            for (source in request.sources) {
                val file = File(buildDir, source.path)
                file.parentFile.mkdirs()
                file.writeText(source.content)
            }

            // 5. Inject the fabric/neoforge entrypoint stubs that call into the common module
            generateFabricEntrypoint(buildDir, request)
            generateNeoForgeEntrypoint(buildDir, request)

            // 6. Run Gradle build
            val (exitCode, buildLog) = runGradleBuild(buildDir)
            if (exitCode != 0) {
                // Errors appear at the beginning of the log; stack traces at the end.
                // Capture both so the caller can see the actual failure reason.
                val log = buildLog.toString()
                val trimmedLog = if (log.length <= 8000) log
                    else log.take(5000) + "\n...[truncated]...\n" + log.takeLast(3000)
                return@withContext CompileResult(
                    success = false,
                    buildLog = trimmedLog,
                    error = "Gradle build failed (exit $exitCode). Check buildLog for details.",
                )
            }

            // 7. Collect output jars
            val fabricJar = findOutputJar(buildDir, "fabric")
            val neoforgeJar = findOutputJar(buildDir, "neoforge")

            log.info("Build {} succeeded. fabricJar={} neoforgeJar={}", buildId, fabricJar?.name, neoforgeJar?.name)

            CompileResult(
                success = true,
                fabricJarBase64 = fabricJar?.readBytes()?.let { Base64.getEncoder().encodeToString(it) },
                neoforgeJarBase64 = neoforgeJar?.readBytes()?.let { Base64.getEncoder().encodeToString(it) },
                buildLog = buildLog.takeLast(4000),
            )
        } catch (e: Exception) {
            log.error("Build {} failed with exception", buildId, e)
            CompileResult(success = false, error = e.message ?: "Unknown error")
        } finally {
            buildDir.deleteRecursively()
            log.info("Build {} workspace cleaned up", buildId)
        }
    }

    // ─── Gradle properties ───────────────────────────────────────────────────

    private fun writeGradleProperties(dir: File, req: CompileRequest) {
        val existing = File(dir, "gradle.properties").readText()
        val overrides = mapOf(
            "mod_version" to req.version,
            "mod_id" to req.modId,
        )
        val updated = overrides.entries.fold(existing) { text, (key, value) ->
            text.replace(Regex("(?m)^$key=.*$"), "$key=$value")
        }
        File(dir, "gradle.properties").writeText(updated)
    }

    // ─── Resource file generation ─────────────────────────────────────────────

    private fun generateFabricModJson(dir: File, req: CompileRequest) {
        val file = File(dir, "fabric/src/main/resources/fabric.mod.json")
        file.parentFile.mkdirs()
        file.writeText(
            """
            {
              "schemaVersion": 1,
              "id": "${req.modId}",
              "version": "${req.version}",
              "name": "${req.modName}",
              "description": "${req.description.replace("\"", "\\\"")}",
              "authors": [],
              "environment": "*",
              "entrypoints": {
                "main": ["com.iguzman.mod.fabric.${req.mainClass}Fabric"]
              },
              "depends": {
                "fabricloader": ">=0.16.0",
                "fabric-api": "*",
                "minecraft": "~1.21.4",
                "java": ">=21",
                "fabric-language-kotlin": ">=1.12.0+kotlin.2.1.0"
              }
            }
            """.trimIndent()
        )
    }

    private fun generateNeoForgeMods(dir: File, req: CompileRequest) {
        val file = File(dir, "neoforge/src/main/resources/META-INF/neoforge.mods.toml")
        file.parentFile.mkdirs()
        val safeName = req.modName.replace("\"", "\\\"")
        val safeDescription = req.description.replace("'''", "''\\''")
        file.writeText(
            """
            modLoader="kotlinfml"
            loaderVersion="[2,)"
            license="All Rights Reserved"

            [[mods]]
                modId="${req.modId}"
                version="${req.version}"
                displayName="$safeName"
                description='''$safeDescription'''

            [[dependencies.${req.modId}]]
                modId="neoforge"
                type="required"
                versionRange="[21.4,)"
                ordering="NONE"
                side="BOTH"

            [[dependencies.${req.modId}]]
                modId="minecraft"
                type="required"
                versionRange="[1.21.4,1.22)"
                ordering="NONE"
                side="BOTH"
            """.trimIndent()
        )

        // mods.toml requires a companion services file for NeoForge mod discovery
        val servicesDir = File(dir, "neoforge/src/main/resources/META-INF/services")
        servicesDir.mkdirs()
    }

    private fun generatePackMcMeta(dir: File, req: CompileRequest) {
        val content = """
            {
                "pack": {
                    "description": "${req.modName} Resources",
                    "pack_format": 34
                }
            }
        """.trimIndent()
        File(dir, "fabric/src/main/resources/pack.mcmeta").apply { parentFile.mkdirs(); writeText(content) }
        File(dir, "neoforge/src/main/resources/pack.mcmeta").apply { parentFile.mkdirs(); writeText(content) }
    }

    // ─── Entrypoint stubs ─────────────────────────────────────────────────────

    /**
     * Generates a minimal Fabric ModInitializer that delegates to the LLM-generated common module.
     * The LLM only generates common/ sources; loader entrypoints are fixed boilerplate.
     */
    private fun generateFabricEntrypoint(dir: File, req: CompileRequest) {
        val file = File(dir, "fabric/src/main/kotlin/com/iguzman/mod/fabric/${req.mainClass}Fabric.kt")
        file.parentFile.mkdirs()
        file.writeText(
            """
            package com.iguzman.mod.fabric

            import com.iguzman.mod.${req.mainClass}
            import net.fabricmc.api.ModInitializer

            object ${req.mainClass}Fabric : ModInitializer {
                override fun onInitialize() {
                    ${req.mainClass}.init()
                }
            }
            """.trimIndent()
        )
    }

    /**
     * Generates a minimal NeoForge @Mod class that delegates to the LLM-generated common module.
     */
    private fun generateNeoForgeEntrypoint(dir: File, req: CompileRequest) {
        val file = File(dir, "neoforge/src/main/kotlin/com/iguzman/mod/neoforge/${req.mainClass}NeoForge.kt")
        file.parentFile.mkdirs()
        file.writeText(
            """
            package com.iguzman.mod.neoforge

            import com.iguzman.mod.${req.mainClass}
            import net.neoforged.fml.common.Mod

            @Mod(${req.mainClass}.MOD_ID)
            class ${req.mainClass}NeoForge {
                init {
                    ${req.mainClass}.init()
                }
            }
            """.trimIndent()
        )
    }

    // ─── Gradle build ─────────────────────────────────────────────────────────

    private fun runGradleBuild(dir: File): Pair<Int, String> {
        val process = ProcessBuilder(
            "gradle",
            "--no-daemon",
            "--stacktrace",
            ":fabric:remapJar",
            ":neoforge:remapJar",
        )
            .directory(dir)
            .redirectErrorStream(true)
            .apply {
                environment()["GRADLE_USER_HOME"] = gradleHome
                environment()["JAVA_OPTS"] = "-Xmx3G"
            }
            .start()

        val output = StringBuilder()
        // Stream output so it doesn't block on full buffer
        val reader = process.inputStream.bufferedReader()
        val readerThread = Thread {
            reader.lines().forEach { line ->
                output.appendLine(line)
                log.debug("[gradle] {}", line)
            }
        }
        readerThread.start()

        val finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS)
        readerThread.join(5000)

        if (!finished) {
            process.destroyForcibly()
            return Pair(-1, output.toString() + "\n[TIMEOUT after ${timeoutSeconds}s]")
        }

        return Pair(process.exitValue(), output.toString())
    }

    // ─── Jar discovery ────────────────────────────────────────────────────────

    private fun findOutputJar(dir: File, loader: String): File? {
        // remapJar outputs to <loader>/build/libs/*.jar (no classifier suffix)
        val libsDir = File(dir, "$loader/build/libs")
        return libsDir.listFiles()
            ?.filter { it.extension == "jar" && !it.name.contains("-dev") && !it.name.contains("-sources") }
            ?.maxByOrNull { it.lastModified() }
    }
}
