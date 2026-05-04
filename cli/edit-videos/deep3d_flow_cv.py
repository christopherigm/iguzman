#!/usr/bin/env python3
"""OpenCV Farneback dense optical flow — replaces Deep3D's PWC-Net preprocessing.

Reads frames from {output_dir}/images/ and writes flow pairs to
{output_dir}/flows/{interval}/{j:05d}.npy  (shape [2, H, W, 2]).

Each file contains stacked (forward, backward) dense flow:
  flow_pair[0]  →  displacement (dx, dy) from frame j to frame j+interval
  flow_pair[1]  →  displacement (dx, dy) from frame j+interval back to frame j

GPU acceleration: uses cv2.cuda.FarnebackOpticalFlow when an OpenCV CUDA build
is available, otherwise falls back to multi-threaded CPU Farneback.
"""
import argparse
import glob
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import cv2
import numpy as np

# ── Backend detection ──────────────────────────────────────────────────────────

def _has_cuda_cv() -> bool:
    try:
        return (
            hasattr(cv2, "cuda")
            and hasattr(cv2.cuda, "getCudaEnabledDeviceCount")
            and cv2.cuda.getCudaEnabledDeviceCount() > 0
        )
    except Exception:
        return False


USE_CUDA = _has_cuda_cv()

# Keep one shared CUDA flow object (not thread-safe, but CUDA path is serial)
_cuda_flow = None

def _get_cuda_flow():
    global _cuda_flow
    if _cuda_flow is None:
        _cuda_flow = cv2.cuda.FarnebackOpticalFlow.create(
            numLevels=5,
            pyrScale=0.5,
            fastPyramids=False,
            winSize=15,
            numIters=3,
            polyN=5,
            polySigma=1.2,
            flags=0,
        )
    return _cuda_flow


# ── Flow computation ───────────────────────────────────────────────────────────

def _to_gray_gpu(img: np.ndarray) -> "cv2.cuda.GpuMat":
    gpu = cv2.cuda_GpuMat()
    gpu.upload(img)
    return cv2.cuda.cvtColor(gpu, cv2.COLOR_BGR2GRAY)


def _compute_flow_cuda(img1: np.ndarray, img2: np.ndarray):
    """GPU-accelerated Farneback flow img1 → img2.  Returns [H, W, 2]."""
    g1 = _to_gray_gpu(img1)
    g2 = _to_gray_gpu(img2)
    flow_gpu = _get_cuda_flow().calc(g1, g2, None)
    return flow_gpu.download()


def _compute_flow_cpu(img1: np.ndarray, img2: np.ndarray) -> np.ndarray:
    """CPU Farneback flow img1 → img2.  Returns [H, W, 2]."""
    g1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
    return cv2.calcOpticalFlowFarneback(
        g1, g2, None,
        pyr_scale=0.5, levels=5, winsize=15,
        iterations=3, poly_n=5, poly_sigma=1.2,
        flags=cv2.OPTFLOW_FARNEBACK_GAUSSIAN,
    )


def _compute_pair_cpu(args):
    """Worker for ThreadPoolExecutor: (j, path1, path2) → (j, flow_pair)."""
    j, p1, p2 = args
    img1 = cv2.imread(p1)
    img2 = cv2.imread(p2)
    if img1 is None or img2 is None:
        raise RuntimeError(f"Could not read frame at index {j}")
    fwd = _compute_flow_cpu(img1, img2)
    bwd = _compute_flow_cpu(img2, img1)
    return j, np.stack([fwd, bwd], axis=0)


# ── Main ───────────────────────────────────────────────────────────────────────

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

    if USE_CUDA:
        # ── CUDA path: serial (GpuMat / flow object are not thread-safe) ──
        print("  optical flow backend: CUDA (cv2.cuda.FarnebackOpticalFlow)", flush=True)
        for j in range(total):
            img1 = cv2.imread(frames[j])
            img2 = cv2.imread(frames[j + args.interval])
            if img1 is None or img2 is None:
                print(f"ERROR: could not read frame at index {j}", file=sys.stderr)
                sys.exit(1)

            fwd = _compute_flow_cuda(img1, img2)
            bwd = _compute_flow_cuda(img2, img1)
            flow_pair = np.stack([fwd, bwd], axis=0)
            np.save(os.path.join(flows_dir, f"{j:05d}.npy"), flow_pair)

            if j % 100 == 0 or j == total - 1:
                print(f"  optical flow {j + 1}/{total}", flush=True)

    else:
        # ── CPU path: parallel frame pairs via thread pool ─────────────────
        cpu_count = os.cpu_count() or 4
        workers = min(cpu_count, 8)
        print(f"  optical flow backend: CPU ({workers} threads)", flush=True)

        tasks = [(j, frames[j], frames[j + args.interval]) for j in range(total)]
        results = [None] * total

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_compute_pair_cpu, t): t[0] for t in tasks}
            completed = 0
            for future in as_completed(futures):
                j, flow_pair = future.result()
                results[j] = flow_pair
                completed += 1
                if completed % 100 == 0 or completed == total:
                    print(f"  optical flow {completed}/{total}", flush=True)

        for j, flow_pair in enumerate(results):
            np.save(os.path.join(flows_dir, f"{j:05d}.npy"), flow_pair)

    print("  optical flow done.", flush=True)


if __name__ == "__main__":
    main()
