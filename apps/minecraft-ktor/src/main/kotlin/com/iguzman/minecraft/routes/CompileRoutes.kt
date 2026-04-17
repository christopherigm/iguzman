package com.iguzman.minecraft.routes

import com.iguzman.minecraft.models.CompileRequest
import com.iguzman.minecraft.services.CompileService
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Routing.compileRoutes(compileService: CompileService) {

    get("/health") {
        call.respond(mapOf("status" to "ok"))
    }

    post("/compile") {
        val request = call.receive<CompileRequest>()

        require(request.modId.isNotBlank()) { "modId must not be blank" }
        require(request.modId.matches(Regex("[a-z0-9_]{1,64}"))) {
            "modId must be lowercase alphanumeric + underscores, max 64 chars"
        }
        require(request.modName.isNotBlank()) { "modName must not be blank" }
        require(request.mainClass.isNotBlank()) { "mainClass must not be blank" }
        require(request.mainClass.matches(Regex("[A-Z][A-Za-z0-9]{1,63}"))) {
            "mainClass must be a PascalCase identifier, max 64 chars"
        }
        require(request.version.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+"))) {
            "version must be semver (e.g. 1.0.0)"
        }
        require(request.sources.isNotEmpty()) { "sources must not be empty" }
        require(request.sources.size <= 50) { "sources must not exceed 50 files" }
        for (source in request.sources) {
            val normalized = java.io.File(source.path).normalize()
            require(!normalized.isAbsolute && !source.path.contains("..")) {
                "source path '${source.path}' is invalid"
            }
        }

        val result = compileService.compile(request)
        val code = if (result.success) HttpStatusCode.OK else HttpStatusCode.UnprocessableEntity
        call.respond(code, result)
    }
}
