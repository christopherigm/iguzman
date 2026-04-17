package com.iguzman.minecraft

import com.iguzman.minecraft.plugins.configureRouting
import com.iguzman.minecraft.plugins.configureSerialization
import com.iguzman.minecraft.plugins.configureStatusPages
import io.ktor.server.application.*
import io.ktor.server.netty.*

fun main(args: Array<String>) = EngineMain.main(args)

fun Application.module() {
    configureSerialization()
    configureStatusPages()
    configureRouting()
}
