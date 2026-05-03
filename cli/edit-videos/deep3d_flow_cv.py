#!/usr/bin/env python3
"""OpenCV Farneback dense optical flow — replaces Deep3D's PWC-Net preprocessing.

Reads frames from {output_dir}/images/ and writes flow pairs to
{output_dir}/flows/{interval}/{j:05d}.npy  (shape [2, H, W, 2]).

Each file contains stacked (forward, backward) dense flow:
  flow_pair[0]  →  displacement (dx, dy) from frame j to frame j+interval
  flow_pair[1]  →  displacement (dx, dy) from frame j+interval back to frame j
"""
import argparse
import glob
import os
import sys

import cv2
import numpy as np


def _compute_flow(img1: np.ndarray, img2: np.ndarray) -> np.ndarray:
    """Farneback dense optical flow img1 → img2.  Returns [H, W, 2] displacement array."""
    g1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
    return cv2.calcOpticalFlowFarneback(
        g1, g2, None,
        pyr_scale=0.5, levels=5, winsize=15,
        iterations=3, poly_n=5, poly_sigma=1.2,
        flags=cv2.OPTFLOW_FARNEBACK_GAUSSIAN,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compute dense optical flow for Deep3D (replaces PWC-Net)"
    )
    parser.add_argument(
        "--output_dir", required=True,
        help="Deep3D output dir for this clip (contains images/ subfolder)",
    )
    parser.add_argument(
        "--interval", type=int, default=1,
        help="Frame interval for which to compute flow",
    )
    args = parser.parse_args()

    frames_dir = os.path.join(args.output_dir, "images")
    flows_dir  = os.path.join(args.output_dir, "flows", str(args.interval))
    os.makedirs(flows_dir, exist_ok=True)

    frames = sorted(glob.glob(os.path.join(frames_dir, "*.png")))
    n = len(frames)
    if n == 0:
        print(f"ERROR: no frames found in {frames_dir}", file=sys.stderr)
        sys.exit(1)

    total = n - args.interval
    if total <= 0:
        print(f"ERROR: not enough frames ({n}) for interval {args.interval}", file=sys.stderr)
        sys.exit(1)

    for j in range(total):
        img1 = cv2.imread(frames[j])
        img2 = cv2.imread(frames[j + args.interval])
        if img1 is None or img2 is None:
            print(f"ERROR: could not read frame at index {j}", file=sys.stderr)
            sys.exit(1)

        fwd = _compute_flow(img1, img2)           # [H, W, 2]
        bwd = _compute_flow(img2, img1)           # [H, W, 2]
        flow_pair = np.stack([fwd, bwd], axis=0)  # [2, H, W, 2]
        np.save(os.path.join(flows_dir, f"{j:05d}.npy"), flow_pair)

        if j % 100 == 0 or j == total - 1:
            print(f"  optical flow {j + 1}/{total}", flush=True)

    print("  optical flow done.", flush=True)


if __name__ == "__main__":
    main()
