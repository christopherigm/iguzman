package com.iguzman.minecraft.plugins

import com.iguzman.minecraft.routes.compileRoutes
import com.iguzman.minecraft.services.CompileService
import io.ktor.server.application.*
import io.ktor.server.routing.*

fun Application.configureRouting() {
    val compileService = CompileService(
        templateDir = environment.config.property("compile.templateDir").getString(),
        gradleHome = environment.config.property("compile.gradleHome").getString(),
        workspaceDir = environment.config.property("compile.workspaceDir").getString(),
        timeoutSeconds = environment.config.property("compile.timeoutSeconds").getString().toLong(),
    )

    routing {
        compileRoutes(compileService)
    }
}
