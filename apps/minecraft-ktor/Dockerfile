# syntax=docker.io/docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 – Build the Ktor fat-jar
# ─────────────────────────────────────────────────────────────────────────────
FROM gradle:8.11-jdk21 AS ktor-builder

WORKDIR /build
COPY build.gradle.kts settings.gradle.kts gradle.properties ./
# Pre-cache dependencies before copying source so this layer is reused on source-only changes
RUN gradle dependencies --no-daemon -q 2>/dev/null || true
COPY src ./src

RUN gradle installDist --no-daemon -q

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 – Pre-warm the Architectury/Minecraft Gradle cache
#
# This stage downloads and caches all Minecraft + Architectury dependencies
# so that runtime builds are fast (30–90 s instead of 10+ min).
# The resulting /opt/gradle-home layer is ~1–2 GB but is baked into the image.
# ─────────────────────────────────────────────────────────────────────────────
FROM gradle:8.11-jdk21 AS cache-warmer

ENV GRADLE_USER_HOME=/opt/gradle-home

WORKDIR /opt/mc-template
COPY template/ ./

RUN mkdir -p /opt/gradle-home && \
    # Resolve all dependencies using system gradle (gradle-wrapper.jar is not bundled)
    gradle --no-daemon :common:dependencies :fabric:dependencies :neoforge:dependencies \
        --configuration compileClasspath 2>&1 || true && \
    # Attempt a full build with the placeholder source to warm the full toolchain
    gradle --no-daemon :fabric:remapJar :neoforge:remapJar 2>&1 || true

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 – Runtime image
# ─────────────────────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jdk

WORKDIR /app

# Install Gradle CLI (used at runtime to build user mods)
RUN apt-get update && \
    apt-get install -y --no-install-recommends wget unzip && \
    wget -q https://services.gradle.org/distributions/gradle-8.11.1-bin.zip -O /tmp/gradle.zip && \
    unzip -q /tmp/gradle.zip -d /opt && \
    ln -s /opt/gradle-8.11.1/bin/gradle /usr/local/bin/gradle && \
    rm /tmp/gradle.zip && \
    apt-get purge -y wget unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Copy pre-warmed Gradle/Minecraft dependency cache
COPY --from=cache-warmer /opt/gradle-home /opt/gradle-home

# Copy the Architectury template (without sources — injected at runtime)
COPY --from=cache-warmer /opt/mc-template /opt/mc-template

# Copy the Ktor application
COPY --from=ktor-builder /build/build/install/minecraft-ktor /app

# Create workspace dir for per-request builds
RUN mkdir -p /tmp/mc-builds

ENV TEMPLATE_DIR=/opt/mc-template
ENV GRADLE_USER_HOME=/opt/gradle-home
ENV BUILD_WORKSPACE_DIR=/tmp/mc-builds
ENV PORT=8080

EXPOSE 8080

CMD ["/app/bin/minecraft-ktor"]
