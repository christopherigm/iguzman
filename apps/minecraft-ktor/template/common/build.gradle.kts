architectury {
    common(*(rootProject.property("enabled_platforms") as String).split(",").toTypedArray())
}

dependencies {
    modImplementation("net.fabricmc:fabric-loader:${rootProject.property("fabric_loader_version")}")
    modApi("dev.architectury:architectury:${rootProject.property("architectury_version")}")
}
