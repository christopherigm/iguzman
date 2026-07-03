#!/usr/bin/env python3
"""item_sprite.py - deterministic pixel-art sprites for mob-forge inventory items.

Unlike a mob, a flat Minecraft item (parent `item/generated` or `item/handheld`)
has NO geometry to author: the game auto-extrudes the little 3D slab you see
in-hand straight from the sprite's alpha channel at runtime. So for an item the
sprite *is* the model - the only thing to author is a small PNG.

This tool renders that PNG deterministically from a compact, hand-authored spec
(a palette + a character grid), then embeds the result into an editable
`blockbench/items/<id>.bbmodel` so the operator can open it in Blockbench and
touch it up. That mirrors how `mob_face.py` re-embeds its result into a mob's
`.bbmodel` - source-of-truth stays in sync, and the shipped PNG is a build
output. No Blockbench / MCP is needed to generate; Blockbench is only the
human touch-up surface (see apps/mob-forge/CLAUDE.md -> "Authoring an item").

Spec format (tools/items/<id>.item.json)
----------------------------------------
  {
    "id": "ruby",
    "texture": "src/main/resources/assets/mobforge/textures/item/ruby.png",
    "bbmodel": "blockbench/items/ruby.bbmodel",
    "palette": { ".": [0,0,0,0], "r": [205,30,58,255], ... },   # char -> RGBA
    "grid":    ["................", ... ]                        # rows of chars
  }

Every row must be the same length; width = row length, height = row count
(16x16 by convention). The char "." (or any RGBA with alpha 0) is transparent.

Usage
-----
  python3 tools/item_sprite.py render --spec tools/items/<id>.item.json --root .
  python3 tools/item_sprite.py render --spec tools/items/<id>.item.json --no-bbmodel
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import uuid
from typing import Any

from PIL import Image


# --------------------------------------------------------------------------- #
# Sprite rendering (palette + char grid -> RGBA PNG)
# --------------------------------------------------------------------------- #


def render_grid(palette: dict[str, list[int]], grid: list[str]) -> Image.Image:
    """Rasterize a char grid into an RGBA image using the palette map."""
    if not grid:
        raise SystemExit("spec 'grid' is empty")
    height = len(grid)
    width = len(grid[0])
    for y, row in enumerate(grid):
        if len(row) != width:
            raise SystemExit(
                f"grid row {y} has width {len(row)}, expected {width} "
                "(every row must be the same length)"
            )

    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch not in palette:
                raise SystemExit(f"grid char {ch!r} at ({x},{y}) is not in the palette")
            rgba = palette[ch]
            if len(rgba) == 3:
                rgba = [*rgba, 255]
            if rgba[3] == 0:
                continue  # transparent - leave the canvas empty
            img.putpixel((x, y), tuple(rgba))
    return img


# --------------------------------------------------------------------------- #
# Blockbench source (.bbmodel) - a paintable, editable copy of the sprite
# --------------------------------------------------------------------------- #


def bbmodel_for(item_id: str, png_path: str, width: int, height: int) -> dict[str, Any]:
    """Build a minimal Generic-Model .bbmodel that just carries the sprite as a
    paintable texture. A flat item has no geometry (the alpha channel IS the
    model), so the .bbmodel exists only so the operator can open it, paint the
    texture in the Paint tab, then export the PNG back over the build output.
    The texture object mirrors the fields Blockbench writes so it opens cleanly.
    """
    with open(png_path, "rb") as fh:
        data_url = "data:image/png;base64," + base64.b64encode(fh.read()).decode()
    return {
        "meta": {"format_version": "4.5", "model_format": "free", "box_uv": False},
        "name": item_id,
        "model_identifier": "",
        "resolution": {"width": width, "height": height},
        "elements": [],
        "outliner": [],
        "textures": [
            {
                "name": f"{item_id}.png",
                "folder": "item",
                "namespace": "mobforge",
                "id": "0",
                "width": width,
                "height": height,
                "uv_width": width,
                "uv_height": height,
                "particle": False,
                "use_as_default": True,
                "layers_enabled": False,
                "render_mode": "default",
                "render_sides": "auto",
                "frame_time": 1,
                "frame_order_type": "loop",
                "frame_order": "",
                "frame_interpolate": False,
                "visible": True,
                "internal": True,
                "saved": False,
                "uuid": str(uuid.uuid4()),
                "source": data_url,
            }
        ],
    }


def write_bbmodel(bbmodel_path: str, item_id: str, png_path: str, width: int, height: int) -> None:
    """Write (or refresh) the .bbmodel. If one already exists we only re-embed the
    texture so any operator edits to the rest of the project survive - same
    source-of-truth-sync contract as mob_face.py's sync_bbmodel."""
    os.makedirs(os.path.dirname(bbmodel_path), exist_ok=True)
    if os.path.exists(bbmodel_path):
        with open(bbmodel_path) as fh:
            model = json.load(fh)
        with open(png_path, "rb") as fh:
            data_url = "data:image/png;base64," + base64.b64encode(fh.read()).decode()
        textures = model.get("textures")
        if textures:
            for tex in textures:
                tex["source"] = data_url
        else:
            model = bbmodel_for(item_id, png_path, width, height)
    else:
        model = bbmodel_for(item_id, png_path, width, height)
    with open(bbmodel_path, "w") as fh:
        json.dump(model, fh)


# --------------------------------------------------------------------------- #
# render command
# --------------------------------------------------------------------------- #


def cmd_render(args: argparse.Namespace) -> None:
    with open(args.spec) as fh:
        spec = json.load(fh)
    root = args.root or os.path.dirname(os.path.abspath(args.spec))

    def rp(p: str) -> str:
        return p if os.path.isabs(p) else os.path.normpath(os.path.join(root, p))

    item_id = spec["id"]
    img = render_grid(spec["palette"], spec["grid"])

    png_path = rp(spec["texture"])
    os.makedirs(os.path.dirname(png_path), exist_ok=True)
    img.save(png_path)
    print(f"wrote {png_path} ({img.width}x{img.height})")

    bbmodel = spec.get("bbmodel")
    if bbmodel and not args.no_bbmodel:
        write_bbmodel(rp(bbmodel), item_id, png_path, img.width, img.height)
        print(f"wrote editable source {rp(bbmodel)}")


# --------------------------------------------------------------------------- #


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("render", help="render a sprite spec to PNG + .bbmodel")
    r.add_argument("--spec", required=True)
    r.add_argument("--root", help="base dir for relative paths in the spec (default: spec's dir)")
    r.add_argument("--no-bbmodel", action="store_true", help="write only the PNG, not the .bbmodel")
    r.set_defaults(func=cmd_render)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
