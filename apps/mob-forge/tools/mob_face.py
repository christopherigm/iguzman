#!/usr/bin/env python3
"""mob_face.py - deterministic facial features + ear geometry for mob-forge mobs.

The mob-forge pipeline gives every cube its own non-overlapping rectangle on an
auto-scaled box-UV atlas (see apps/mob-forge/CLAUDE.md -> "Per-part UV layout").
That is exactly what lets us paint one body part without bleeding onto the
others. This tool uses the box-UV net documented in that same file to locate a
part's face on the atlas and paint recognizable facial features onto it -
eyes, mouth, nose, nostrils, brows, whiskers - so a new mob ships with a face
instead of a blank fill.

Subcommands
-----------
  paint  --spec faces/<id>.face.json
         Paint features onto the mob's texture atlas, computing each feature's
         target rectangle from its cube + face in the geo.json. Re-embeds the
         result into the .bbmodel too (keeps source-of-truth in sync).

  ears   --geo <geo.json> --head <bone> [--head-cube N] [--tilt DEG]
         Compute two symmetric ear cubes from the head cube and emit the exact
         geometry (origin/size/pivot/rotation/parent) to place during modeling.
         Ears are real geometry - they belong in the model -> bbmodel -> UV
         repack -> face-paint flow, so this prints an add_group + place_cube
         plan rather than mutating committed files.

  faces  --geo <geo.json> [--bone NAME]
         Debug helper: dump the box-UV pixel rectangle of every face of every
         cube, so you can author a spec by eye.

Everything is deterministic and needs no Blockbench - painting the atlas
directly is the "texture-only tweak" fast path blessed by CLAUDE.md.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from typing import Any

from PIL import Image

# --------------------------------------------------------------------------- #
# Box-UV geometry (mirror of the net in apps/mob-forge/CLAUDE.md)
# --------------------------------------------------------------------------- #


def box_uv_faces(size: list[float], uv: list[float]) -> dict[str, tuple[float, float, float, float]]:
    """Return the (x0, y0, x1, y1) texel rect of each face for a box-UV cube.

    size = [w, h, d], uv = [u, v]. The rects come verbatim from the net in
    CLAUDE.md; up/down have flipped axes so callers must normalize.
    """
    w, h, d = size
    u, v = uv
    return {
        "east": (u, v + d, u + d, v + d + h),
        "north": (u + d, v + d, u + d + w, v + d + h),
        "west": (u + d + w, v + d, u + 2 * d + w, v + d + h),
        "south": (u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h),
        "up": (u + d + w, v + d, u + d, v),
        "down": (u + d + 2 * w, v, u + d + w, v + d),
    }


# "front" of a Minecraft mob is its +Z (south) face by convention; the aliases
# let a spec say what it means and stay readable.
FACE_ALIASES = {
    "front": "south",
    "back": "north",
    "top": "up",
    "bottom": "down",
    "left": "west",
    "right": "east",
}


def resolve_face(name: str) -> str:
    return FACE_ALIASES.get(name, name)


def pixel_rect(size: list[float], uv: list[float], face: str) -> tuple[int, int, int, int]:
    """Normalized integer pixel rect (x0<=x1, y0<=y1) of a cube's face."""
    x0, y0, x1, y1 = box_uv_faces(size, uv)[resolve_face(face)]
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    return int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))


# --------------------------------------------------------------------------- #
# geo.json access
# --------------------------------------------------------------------------- #


def load_geo(path: str) -> dict[str, Any]:
    with open(path) as fh:
        return json.load(fh)


def iter_bones(geo: dict[str, Any]):
    for g in geo["minecraft:geometry"]:
        for bone in g["bones"]:
            yield g, bone


def find_cube(geo: dict[str, Any], bone_name: str, cube: Any) -> tuple[list[float], list[float]]:
    """Return (size, uv) for a cube selected by bone name and index/'auto'."""
    for _, bone in iter_bones(geo):
        if bone.get("name") != bone_name:
            continue
        cubes = bone.get("cubes", [])
        if not cubes:
            raise ValueError(f"bone '{bone_name}' has no cubes")
        if cube == "auto":
            # The head is usually the highest-sitting non-body cube; pick the
            # cube whose top (origin.y + size.y) is greatest.
            idx = max(range(len(cubes)), key=lambda i: cubes[i]["origin"][1] + cubes[i]["size"][1])
        else:
            idx = int(cube)
        c = cubes[idx]
        return c["size"], c["uv"]
    raise ValueError(f"bone '{bone_name}' not found in geo")


def texture_size(geo: dict[str, Any]) -> tuple[int, int]:
    desc = geo["minecraft:geometry"][0]["description"]
    return int(desc["texture_width"]), int(desc["texture_height"])


# --------------------------------------------------------------------------- #
# Painting primitives (work in a face's normalized [0,1] coordinate space)
# --------------------------------------------------------------------------- #


class Face:
    """A cube face mapped onto the atlas, addressable in normalized coords.

    fx/fy are in [0,1] with (0,0) at the face's top-left as drawn. Pairs use
    mirror_x so left/right features are perfectly symmetric even on even-width
    faces where a rounded center would drift.
    """

    def __init__(self, img: Image.Image, rect: tuple[int, int, int, int]):
        self.img = img
        self.x0, self.y0, self.x1, self.y1 = rect
        self.w = max(1, self.x1 - self.x0)
        self.h = max(1, self.y1 - self.y0)

    def px(self, fx: float, fy: float) -> tuple[int, int]:
        x = self.x0 + int(round(fx * (self.w - 1)))
        y = self.y0 + int(round(fy * (self.h - 1)))
        return x, y

    def mirror_x(self, x: int) -> int:
        return self.x1 - 1 - (x - self.x0)

    def dot(self, x: int, y: int, color, radius: int = 0) -> None:
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                px, py = x + dx, y + dy
                if 0 <= px < self.img.width and 0 <= py < self.img.height:
                    self.img.putpixel((px, py), tuple(color))

    def hline(self, x_start: int, x_end: int, y: int, color, thickness: int = 1) -> None:
        if x_end < x_start:
            x_start, x_end = x_end, x_start
        for x in range(x_start, x_end + 1):
            for t in range(thickness):
                self.dot(x, y + t, color)


def _color(feature: dict, key: str, default=None):
    c = feature.get(key, default)
    return tuple(c) if c is not None else None


def paint_eyes(face: Face, f: dict) -> None:
    y = f.get("y", 0.32)
    spread = f.get("spread", 0.55)
    radius = int(f.get("radius", 0))
    pupil = _color(f, "color", [26, 26, 30, 255])
    sclera = _color(f, "sclera")
    highlight = _color(f, "highlight")

    lx, ly = face.px(0.5 - spread / 2, y)
    rx = face.mirror_x(lx)
    for cx in (lx, rx):
        if sclera:
            face.dot(cx, ly, sclera, radius + 1)
        face.dot(cx, ly, pupil, radius)
        if highlight:
            face.dot(cx, ly - 1 if radius else ly, highlight, 0)


def paint_nostrils(face: Face, f: dict) -> None:
    y = f.get("y", 0.4)
    spread = f.get("spread", 0.4)
    radius = int(f.get("radius", 0))
    color = _color(f, "color", [12, 10, 12, 255])
    lx, ly = face.px(0.5 - spread / 2, y)
    rx = face.mirror_x(lx)
    face.dot(lx, ly, color, radius)
    face.dot(rx, ly, color, radius)


def paint_nose(face: Face, f: dict) -> None:
    y = f.get("y", 0.0)
    width = f.get("width", 0.6)
    height = f.get("height", 0.45)
    color = _color(f, "color", [30, 24, 28, 255])
    x0, top = face.px(0.5 - width / 2, y)
    x1 = face.mirror_x(x0)
    bottom = top + max(0, int(round(height * (face.h - 1))))
    for yy in range(top, bottom + 1):
        face.hline(x0, x1, yy, color)


def paint_mouth(face: Face, f: dict) -> None:
    y = f.get("y", 0.78)
    width = f.get("width", 0.5)
    thickness = int(f.get("thickness", 1))
    curve = f.get("curve", "smile")
    color = _color(f, "color", [40, 30, 34, 255])
    lx, cy = face.px(0.5 - width / 2, y)
    rx = face.mirror_x(lx)
    face.hline(lx, rx, cy, color, thickness)
    if curve == "smile":
        face.dot(lx, cy - 1, color)
        face.dot(rx, cy - 1, color)
    elif curve == "frown":
        face.dot(lx, cy + 1, color)
        face.dot(rx, cy + 1, color)


def paint_brows(face: Face, f: dict) -> None:
    y = f.get("y", 0.16)
    spread = f.get("spread", 0.55)
    width = f.get("width", 0.22)
    thickness = int(f.get("thickness", 1))
    color = _color(f, "color", [30, 24, 24, 255])
    lx, cy = face.px(0.5 - spread / 2 - width / 2, y)
    lx2, _ = face.px(0.5 - spread / 2 + width / 2, y)
    face.hline(lx, lx2, cy, color, thickness)
    rx, rx2 = face.mirror_x(lx), face.mirror_x(lx2)
    face.hline(rx, rx2, cy, color, thickness)


def paint_whiskers(face: Face, f: dict) -> None:
    """Dashed side-strokes with a central gap. Needs a face >= ~10px wide to
    read as whiskers rather than a bar; on tiny faces prefer nose+nostrils."""
    rows = int(f.get("rows", 2))
    y = f.get("y", 0.6)
    step = f.get("step", 0.18)
    width = f.get("width", 0.9)
    gap = f.get("gap", 0.30)  # untouched fraction around the centre
    color = _color(f, "color", [170, 170, 175, 255])
    for r in range(rows):
        yy = y + (r - (rows - 1) / 2) * step
        lx, cy = face.px(0.5 - width / 2, yy)
        inl, _ = face.px(0.5 - gap / 2, yy)
        rx, inr = face.mirror_x(lx), face.mirror_x(inl)
        for x in range(lx, inl):        # dashed: every other pixel
            if (x - lx) % 2 == 0:
                face.dot(x, cy, color)
        for x in range(inr + 1, rx + 1):
            if (rx - x) % 2 == 0:
                face.dot(x, cy, color)


def paint_patch(face: Face, f: dict) -> None:
    """Generic filled rectangle - blush, belly patch, eye ring, spots, etc."""
    x = f.get("x", 0.5)
    y = f.get("y", 0.5)
    w = f.get("w", 0.3)
    h = f.get("h", 0.3)
    color = _color(f, "color", [0, 0, 0, 255])
    x0, y0 = face.px(x - w / 2, y - h / 2)
    x1, y1 = face.px(x + w / 2, y + h / 2)
    for yy in range(min(y0, y1), max(y0, y1) + 1):
        face.hline(x0, x1, yy, color)


PAINTERS = {
    "eyes": paint_eyes,
    "nostrils": paint_nostrils,
    "nose": paint_nose,
    "mouth": paint_mouth,
    "brows": paint_brows,
    "whiskers": paint_whiskers,
    "patch": paint_patch,
}


# --------------------------------------------------------------------------- #
# paint command
# --------------------------------------------------------------------------- #


def sync_bbmodel(bbmodel_path: str, png_path: str) -> None:
    """Re-embed the painted PNG into the .bbmodel's texture source."""
    with open(bbmodel_path) as fh:
        model = json.load(fh)
    with open(png_path, "rb") as fh:
        data_url = "data:image/png;base64," + base64.b64encode(fh.read()).decode()
    for tex in model.get("textures", []):
        tex["source"] = data_url
    with open(bbmodel_path, "w") as fh:
        json.dump(model, fh)


def cmd_paint(args: argparse.Namespace) -> None:
    with open(args.spec) as fh:
        spec = json.load(fh)
    root = args.root or os.path.dirname(os.path.abspath(args.spec))

    def rp(p: str) -> str:
        return p if os.path.isabs(p) else os.path.normpath(os.path.join(root, p))

    geo = load_geo(rp(spec["geo"]))
    tex_w, tex_h = texture_size(geo)
    png_path = rp(spec["texture"])

    if spec.get("base_color") and not os.path.exists(png_path) or spec.get("refill"):
        img = Image.new("RGBA", (tex_w, tex_h), tuple(spec["base_color"]))
    else:
        img = Image.open(png_path).convert("RGBA")
        if (img.width, img.height) != (tex_w, tex_h):
            raise SystemExit(
                f"texture {img.size} != geo texture size ({tex_w}x{tex_h}); "
                "re-export the geo or fix the atlas before painting"
            )

    for f in spec["features"]:
        painter = PAINTERS.get(f["type"])
        if not painter:
            raise SystemExit(f"unknown feature type '{f['type']}'")
        size, uv = find_cube(geo, f["bone"], f.get("cube", "auto"))
        rect = pixel_rect(size, uv, f.get("face", "front"))
        painter(Face(img, rect), f)
        print(f"  painted {f['type']:9s} on {f['bone']}[{f.get('cube','auto')}].{f.get('face','front')} rect={rect}")

    img.save(png_path)
    print(f"wrote {png_path} ({tex_w}x{tex_h})")

    bbmodel = spec.get("bbmodel")
    if bbmodel and not args.no_bbmodel:
        sync_bbmodel(rp(bbmodel), png_path)
        print(f"synced embedded texture in {rp(bbmodel)}")


# --------------------------------------------------------------------------- #
# ears command  (geometry plan for the modeling phase)
# --------------------------------------------------------------------------- #


def cmd_ears(args: argparse.Namespace) -> None:
    geo = load_geo(args.geo)
    # locate the head cube's raw dict (need origin, not just size/uv)
    head_cube = None
    for _, bone in iter_bones(geo):
        if bone.get("name") == args.head:
            cubes = bone["cubes"]
            i = (
                max(range(len(cubes)), key=lambda k: cubes[k]["origin"][1] + cubes[k]["size"][1])
                if args.head_cube is None
                else args.head_cube
            )
            head_cube = cubes[i]
            break
    if head_cube is None:
        raise SystemExit(f"head bone '{args.head}' not found in {args.geo}")

    ox, oy, oz = head_cube["origin"]
    hw, hh, hd = head_cube["size"]
    cx = ox + hw / 2

    ew = max(1, round(hw * 0.30))
    eh = max(1, round(hh * 0.55))
    ed = max(1, round(hd * 0.30))
    top = oy + hh                      # sit on the crown
    z = oz + hd * 0.25                 # toward the front third
    inset = hw * 0.12                  # tuck slightly in from the corners
    tilt = args.tilt

    ears = []
    for side, sign in (("left", -1), ("right", 1)):
        # outer edge of the ear flush-ish with the side of the head
        x = cx + sign * (hw / 2 - ew - inset) if sign < 0 else cx + sign * (hw / 2 - inset)
        x = round(cx + sign * (hw / 2 - inset) - (ew if sign < 0 else 0), 3)
        origin = [x, round(top, 3), round(z, 3)]
        pivot = [round(cx + sign * (hw / 2 - inset), 3), round(top, 3), round(z + ed / 2, 3)]
        rotation = [0, 0, round(-sign * tilt, 3)]  # tilt outward
        ears.append(
            {
                "bone": f"{side}_ear",
                "parent": args.head,
                "pivot": pivot,
                "cube": {"origin": origin, "size": [ew, eh, ed], "uv": [0, 0]},
                "rotation": rotation,
            }
        )

    print(f"# Ear geometry for head bone '{args.head}' (cube size {hw}x{hh}x{hd})")
    print("# Run during the MODELING phase, then let the UV-repack + face-paint")
    print("# steps pick the ears up automatically. add_group -> place_cube:\n")
    for e in ears:
        print(f"add_group  name={e['bone']:10s} parent={e['parent']} origin(pivot)={e['pivot']} rotation={e['rotation']}")
        print(f"place_cube bone={e['bone']:10s} position={e['cube']['origin']} size={e['cube']['size']}  (uv auto-repacked)")
    print("\n# machine-readable:")
    print(json.dumps(ears, indent=2))


# --------------------------------------------------------------------------- #
# faces command (debug)
# --------------------------------------------------------------------------- #


def cmd_faces(args: argparse.Namespace) -> None:
    geo = load_geo(args.geo)
    tw, th = texture_size(geo)
    print(f"atlas {tw}x{th}")
    for _, bone in iter_bones(geo):
        if args.bone and bone.get("name") != args.bone:
            continue
        for i, c in enumerate(bone.get("cubes", [])):
            print(f"{bone['name']}[{i}] size={c['size']} uv={c['uv']}")
            for fname in ("south", "north", "east", "west", "up", "down"):
                print(f"    {fname:6s} {pixel_rect(c['size'], c['uv'], fname)}")


# --------------------------------------------------------------------------- #


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("paint", help="paint facial features from a spec")
    p.add_argument("--spec", required=True)
    p.add_argument("--root", help="base dir for relative paths in the spec (default: spec's dir)")
    p.add_argument("--no-bbmodel", action="store_true", help="do not re-embed into the .bbmodel")
    p.set_defaults(func=cmd_paint)

    e = sub.add_parser("ears", help="emit ear-cube geometry for the modeling phase")
    e.add_argument("--geo", required=True)
    e.add_argument("--head", required=True, help="head bone name")
    e.add_argument("--head-cube", type=int, default=None, help="cube index within the head bone (default: tallest)")
    e.add_argument("--tilt", type=float, default=18.0, help="outward tilt in degrees")
    e.set_defaults(func=cmd_ears)

    d = sub.add_parser("faces", help="dump box-UV pixel rects for every face")
    d.add_argument("--geo", required=True)
    d.add_argument("--bone")
    d.set_defaults(func=cmd_faces)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
