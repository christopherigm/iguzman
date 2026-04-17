package com.iguzman.minecraft.models

import kotlinx.serialization.Serializable

@Serializable
data class SourceFile(
    /** Relative path within the project, e.g. "common/src/main/kotlin/com/iguzman/mod/MyMod.kt" */
    val path: String,
    val content: String,
)

@Serializable
data class CompileRequest(
    /** Lowercase snake_case identifier, e.g. "fire_sword_mod" */
    val modId: String,
    /** Human-readable display name, e.g. "Fire Sword Mod" */
    val modName: String,
    val version: String = "1.0.0",
    val description: String = "",
    /** PascalCase name of the common entry-point object, e.g. "FireSwordMod" */
    val mainClass: String,
    /** LLM-generated source files to inject into the template project */
    val sources: List<SourceFile>,
)

@Serializable
data class CompileResult(
    val success: Boolean,
    /** Base64-encoded Fabric .jar, present when success = true */
    val fabricJarBase64: String? = null,
    /** Base64-encoded NeoForge .jar, present when success = true */
    val neoforgeJarBase64: String? = null,
    /** Tail of the Gradle build output for debugging */
    val buildLog: String? = null,
    val error: String? = null,
)
