package com.iguzman.mod

/**
 * Placeholder common entry-point used for Docker image warmup build only.
 * This file is replaced at runtime by LLM-generated sources.
 *
 * Contract the LLM must honour:
 *   - object named after `mainClass` in the request
 *   - const val MOD_ID set to the modId
 *   - fun init() called by both loader entrypoints
 */
object ExampleMod {
    const val MOD_ID = "examplemod"

    fun init() {
        // no-op warmup placeholder
    }
}
