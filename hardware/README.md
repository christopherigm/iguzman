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
`pnpm check-types` do not see this folder. Toolchains are per-project and
documented in each project's own README.

## Layout

Each project is a self-contained folder:

```
hardware/
  <project-name>/
    README.md         toolchain to install, how to flash, how to test
    schematic.html    wiring diagram — open in any browser, no install
    src/              what gets copied to the board
```

Keep the schematic next to the code it describes. A firmware repo whose
wiring diagram lives somewhere else is a firmware repo whose wiring diagram
is wrong within a year.

## Projects

| Project                            | Board                | Language    |
| ---------------------------------- | -------------------- | ----------- |
| [pumpkin-house](./pumpkin-house/)  | Pi Pico / Pico W     | MicroPython |
