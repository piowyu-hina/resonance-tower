#!/usr/bin/env python3
"""Upscale an illustration 4x with RealESRGAN_x4plus_anime_6B (anime-tuned).

A minimal, self-contained re-implementation of the RRDBNet architecture used
by Real-ESRGAN, so this only needs plain `torch` - no `basicsr`/`realesrgan`
pip packages (those pull in an old torchvision API that breaks on current
torchvision releases).

The model file ships in tools/models/ next to this script, so this works on
any machine with torch/opencv/numpy installed - no dependency on a specific
StabilityMatrix/ComfyUI install path. Runs on CUDA automatically if a GPU
build of torch is available, otherwise falls back to CPU (slower).

Usage:
    python upscale_image.py <input.png> [--model <model.pth>] [--out <output.png>] [--resize WxH]

Never overwrites the input - always writes to a new file
(default: <input>_upscaled.png).
"""
import argparse
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

DEFAULT_MODEL = Path(__file__).resolve().parent / "models" / "RealESRGAN_x4plus_anime_6B.pth"


class ResidualDenseBlock(nn.Module):
    def __init__(self, num_feat=64, num_grow_ch=32):
        super().__init__()
        self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
        self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, num_feat, num_grow_ch=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

    def forward(self, x):
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x


class RRDBNet(nn.Module):
    """scale=4 variant only (matches every RealESRGAN_x4* checkpoint)."""

    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_block=6, num_grow_ch=32):
        super().__init__()
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(num_feat, num_grow_ch) for _ in range(num_block)])
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        body_feat = self.conv_body(self.body(feat))
        feat = feat + body_feat
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def load_model(model_path: Path, device: torch.device) -> RRDBNet:
    checkpoint = torch.load(model_path, map_location=device)
    state_dict = checkpoint.get("params_ema") or checkpoint.get("params") or checkpoint
    # anime_6B uses 6 RRDB blocks; infer from the checkpoint just in case a
    # different x4plus variant (23 blocks) is pointed at this script instead.
    num_block = 1 + max(int(k.split(".")[1]) for k in state_dict if k.startswith("body."))
    model = RRDBNet(num_block=num_block)
    model.load_state_dict(state_dict)
    model.eval().to(device)
    return model


def run_model(model, rgb01: np.ndarray, device: torch.device) -> np.ndarray:
    """rgb01: HWC float32 in [0,1]. Returns HWC float32 in [0,1], 4x the input size."""
    tensor = torch.from_numpy(rgb01).permute(2, 0, 1).unsqueeze(0).to(device)
    with torch.no_grad():
        out = model(tensor)
    return out.squeeze(0).clamp(0, 1).permute(1, 2, 0).cpu().numpy()


def run_model_tiled(model, rgb01: np.ndarray, device: torch.device, tile: int, pad: int) -> np.ndarray:
    """Same as run_model but processes overlapping tiles so peak VRAM stays
    roughly constant regardless of image size - a 4x RRDBNet forward pass
    needs several full-resolution feature maps alive at once (the two
    nearest-neighbor upsample steps alone need ~6GB for a 1024x1536 input),
    which is genuinely tight on a 12GB card especially with other apps also
    holding VRAM. Each tile is padded, run, then cropped back to its core
    region (scaled 4x) before being pasted into the output canvas, so tile
    seams land on identical, non-blended pixels - no visible seam.
    """
    h, w = rgb01.shape[:2]
    out = np.empty((h * 4, w * 4, 3), dtype=np.float32)
    y = 0
    while y < h:
        core_h = min(tile, h - y)
        y0, y1 = max(0, y - pad), min(h, y + core_h + pad)
        x = 0
        while x < w:
            core_w = min(tile, w - x)
            x0, x1 = max(0, x - pad), min(w, x + core_w + pad)
            tile_out = run_model(model, rgb01[y0:y1, x0:x1], device)
            # Offset of the core region within this padded tile's 4x output.
            top, left = (y - y0) * 4, (x - x0) * 4
            out[y * 4:(y + core_h) * 4, x * 4:(x + core_w) * 4] = tile_out[top:top + core_h * 4, left:left + core_w * 4]
            x += core_w
        y += core_h
    return out


def upscale(input_path: Path, output_path: Path, model_path: Path, resize: "tuple[int, int] | None", tile: int) -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}")
    model = load_model(model_path, device)

    img = cv2.imread(str(input_path), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise SystemExit(f"could not read image: {input_path}")
    has_alpha = img.ndim == 3 and img.shape[2] == 4
    bgr = img[:, :, :3] if has_alpha else img

    if has_alpha:
        # Fully-transparent pixels can hold arbitrary leftover colors (this
        # PNG's average near-black-but-not-quite, with scattered stray bright
        # pixels) since nothing ever displays them at alpha=0. The model has
        # no concept of alpha though - it upscales the RGB channels as real
        # content, so those stray colors get hallucinated into visible
        # speckle right at the edge once the (correctly-upscaled) alpha mask
        # is reapplied. A first attempt inpainted (extended the character's
        # own edge colors into) the transparent zone, but a large chunk of
        # this art's "transparent" area is actually a soft partial-alpha
        # glow (by design, already ~black in the source), so extending in
        # real colors bled a visible tinted halo through that gradient
        # instead. Flat black gives the model nothing to hallucinate from
        # AND matches this art style's own near-black matte convention, so
        # the soft glow still fades the same way it did in the original.
        transparent_mask = img[:, :, 3] < 8
        if transparent_mask.any():
            bgr = bgr.copy()
            bgr[transparent_mask] = 0

    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    if tile > 0 and max(rgb.shape[:2]) > tile:
        out = run_model_tiled(model, rgb, device, tile=tile, pad=16)
    else:
        out = run_model(model, rgb, device)
    out_bgr = cv2.cvtColor((out * 255.0).round().astype(np.uint8), cv2.COLOR_RGB2BGR)

    if has_alpha:
        alpha_up = cv2.resize(img[:, :, 3], (out_bgr.shape[1], out_bgr.shape[0]), interpolation=cv2.INTER_LANCZOS4)
        out_bgr = cv2.merge([out_bgr[:, :, 0], out_bgr[:, :, 1], out_bgr[:, :, 2], alpha_up])

    if resize:
        out_bgr = cv2.resize(out_bgr, resize, interpolation=cv2.INTER_LANCZOS4)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), out_bgr)
    print(f"wrote {output_path} ({out_bgr.shape[1]}x{out_bgr.shape[0]})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", type=Path)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--resize", type=str, default=None, help="optional WxH to downscale the 4x output to, e.g. 2048x3072")
    parser.add_argument("--scale", type=float, default=None, help="downscale the 4x output to N times the ORIGINAL input size, e.g. --scale 2 (mutually exclusive with --resize)")
    parser.add_argument("--tile", type=int, default=384, help="process the image in overlapping NxN tiles to bound peak VRAM use (0 disables tiling, runs the whole image at once)")
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"input not found: {args.input}")
    if not args.model.exists():
        raise SystemExit(f"model not found: {args.model}")
    if args.resize and args.scale:
        raise SystemExit("use only one of --resize / --scale")

    resize = None
    if args.resize:
        w, h = args.resize.lower().split("x")
        resize = (int(w), int(h))
    elif args.scale:
        from PIL import Image
        with Image.open(args.input) as src:
            resize = (round(src.width * args.scale), round(src.height * args.scale))

    out = args.out or args.input.with_name(f"{args.input.stem}_upscaled{args.input.suffix}")
    upscale(args.input, out, args.model, resize, args.tile)


if __name__ == "__main__":
    main()
