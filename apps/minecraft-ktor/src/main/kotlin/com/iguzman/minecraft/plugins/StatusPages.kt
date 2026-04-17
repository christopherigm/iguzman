package com.iguzman.minecraft.plugins

import com.iguzman.minecraft.models.CompileResult
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.response.*

fun Application.configureStatusPages() {
    install(StatusPages) {
        exception<IllegalArgumentException> { call, cause ->
            call.respond(
                HttpStatusCode.BadRequest,
                CompileResult(success = false, error = cause.message),
            )
        }
        exception<Throwable> { call, cause ->
            call.application.log.error("Unhandled exception", cause)
            call.respond(
                HttpStatusCode.InternalServerError,
                CompileResult(success = false, error = cause.message ?: "Internal error"),
            )
        }
    }
}
