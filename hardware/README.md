# hardware/

Physical-device projects: microcontroller firmware, schematics, and the
notes that go with them. Raspberry Pi Pico, Arduino, and anything else that
gets flashed to a board rather than deployed to a cluster.

## This folder is deliberately outside the pnpm workspace

`pnpm-workspace.yaml` globs only `apps/*` and `packages/*`. `hardware/` is
not in that list, and neither is `cli/` — both are plain source trees the
root scripts reach into, invisible to pnpm and to Turborepo.

That is on purpose. Projects here have:

- **no `package.json`** and no Node dependencies to install,
- **nothing for `turbo run build` to build** — MicroPython is interpreted
  and copied to the board; Arduino sketches build in their own toolchain,
- **no deployment target** in the cluster. Everything under `apps/` ships to
  MicroK8s, a TV, an app store, or Minecraft. These ship over a USB cable.

Adding `hardware/*` to the workspace would force every project to carry
stub `lint` and `check-types` scripts (the way `apps/mob-forge` does) and
would drag them into every `pnpm build` and `pnpm lint` graph, in exchange
for nothing. `apps/mob-forge` earns its place in the workspace because it
has a real Gradle build worth wiring into Turborepo. Firmware does not.

**Consequence:** `pnpm install`, `pnpm build`, `pnpm lint` and
`pnpm check-types` do not see this folder.

## The documentation lives in `apps/help`, not here

**This folder holds what goes on the board and nothing else** — firmware,
plus any assets that ship alongside it (`pumpkin-house/tracks/`). Every
schematic, wiring
table, toolchain instruction, tuning note and troubleshooting table for a
hardware project belongs to the **Hardware section of the help app**, as a
menu item plus its own detail page at `/hardware/<project-name>`:

```
hardware/
  <project-name>/
    src/              firmware — what gets copied to the board, plus
                      any bench tool run straight off the host with
                      `mpremote run` (pumpkin-house/src/selftest.py)
    <assets>/         anything else the board carries (pumpkin-house/tracks/)

apps/help/
  lib/hardware-projects.json                            the registry entry
  app/[locale]/hardware/[project]/<name>.tsx            the build sheet
```

This reverses the advice that used to be here ("keep the schematic next to
the code it describes"). The concern behind it was real — a wiring diagram
kept away from its firmware is wrong within a year — but a `schematic.html`
sitting in a folder nobody opens drifts just as fast, and it could not be
searched, linked, themed, or read on a phone at the bench. So the diagram
moved to where the rest of this monorepo's documentation already lives, and
the drift risk is handled by a rule instead of by proximity:
`apps/help/CLAUDE.md` requires the help page and the firmware to be updated
in the **same task**, exactly as it already requires for every documented
CLI script.

Adding a project means a JSON entry, a `<slug>.tsx` build sheet,
one line in that route's `PROJECT_DOCS` map, and the name/description keys
in `messages/en.json` and `es.json`. See `apps/help/CLAUDE.md` → "Hardware".

## Projects

| Project                           | Board            | Language    | Documentation                        |
| --------------------------------- | ---------------- | ----------- | ------------------------------------ |
| [pumpkin-house](./pumpkin-house/) | Pi Pico / Pico W | MicroPython | help app → `/hardware/pumpkin-house` |
