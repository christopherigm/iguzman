# mob-forge

An AI-authored Minecraft **1.20.2 / NeoForge** mod that produces GeckoLib-animated
mobs. Claude Code writes the Java game logic **and** drives 3D model creation,
rigging, and animation inside **Blockbench** over MCP — a prompt-to-play pipeline.

Full spec: [`apps/prds/minecraft.md`](../prds/minecraft.md).

## Monorepo integration

`mob-forge` is a Gradle/Java project that lives inside this Turborepo monorepo as
a workspace member. A thin `package.json` maps Turbo tasks onto `./gradlew`, so
`pnpm --filter=mob-forge build` builds the mod. The Minecraft game, the NeoForge
MDK caches, and all Gradle build output are **downloaded on demand and never
committed** (see `.gitignore`).

## Getting started

```bash
# From the repo root — installs Java 17, Blockbench + plugins, and bootstraps
# the pinned NeoForge 1.20.2 MDK into this folder (cross-platform: Linux + macOS).
pnpm setup-minecraft

# Build the mod / launch the dev client:
pnpm --filter=mob-forge build
pnpm --filter=mob-forge dev
```

Versions are pinned in [`gradle.properties`](./gradle.properties). Working notes
and guardrails for Claude Code live in [`CLAUDE.md`](./CLAUDE.md).
