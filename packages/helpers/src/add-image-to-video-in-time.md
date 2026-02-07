# add-image-to-video-in-time

Overlays an image on a video during a specified time range using **ffmpeg**.

## Prerequisites

- [ffmpeg](https://ffmpeg.org/) must be installed and available on `PATH`.

## Usage

```ts
import { addImageToVideoInTime } from '@iguzman/helpers';

const result = await addImageToVideoInTime({
  srcVideo: 'intro.mp4',
  srcImage: 'watermark.png',
  dest: 'intro-watermarked.mp4',
  start: 0,
  end: 10,
  width: 150,
});

console.log(result.mediaPath);    // 'media/intro-watermarked.mp4'
console.log(result.absolutePath); // '/app/media/intro-watermarked.mp4'
```

## Options

| Parameter      | Type     | Default                                              | Description                                                                 |
| -------------- | -------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `srcVideo`     | `string` | _required_                                           | Path to the source video file (relative to the media folder).               |
| `srcImage`     | `string` | _required_                                           | Path to the overlay image file (relative to the media folder).              |
| `dest`         | `string` | _required_                                           | Output file path (relative to the media folder).                            |
| `start`        | `number` | `0`                                                  | Time (seconds) when the overlay starts appearing.                           |
| `end`          | `number` | `2`                                                  | Time (seconds) when the overlay stops appearing.                            |
| `x`            | `string` | `'(main_w-overlay_w)/2'`                             | Horizontal position as an ffmpeg expression (centred by default).           |
| `y`            | `string` | `'main_h-overlay_h'`                                 | Vertical position as an ffmpeg expression (bottom edge by default).         |
| `width`        | `number` | `200`                                                | Width in pixels to scale the overlay to. Height scales proportionally.      |
| `outputFolder` | `string` | `'/app/media'` (prod) or `'public/media'` (non-prod) | Base directory for all media files.                                         |

## How it works

1. Resolves absolute file paths by joining `outputFolder` with each input path (stripping any leading `media/` prefix).
2. Builds an ffmpeg argument list that:
   - Scales the overlay image to the target `width` while preserving aspect ratio (`scale=<width>:-1`).
   - Positions the scaled image at (`x`, `y`) on the video frame.
   - Limits visibility to the `[start, end]` time window via `enable='between(t, start, end)'`.
3. Executes ffmpeg via `execFile` (argument array — safe from shell injection).

## Improvements over the original

- **Security**: Uses `execFile` with an argument array instead of `exec` with string concatenation, eliminating shell injection risks.
- **Bug fix**: `replaceAll('media/', '')` replaced with a regex that only strips a leading `media/` prefix — no longer corrupts paths containing `media/` mid-string.
- **Bug fix**: The original `y` default was `'main_h-overlay_h-0'` (trailing `-0` is harmless but unnecessary). Cleaned to `'main_h-overlay_h'`.
- **Typing**: `width` is now `number` instead of `string`. Named result type (`AddImageToVideoResult`) instead of a bare `string`. Dedicated `FfmpegExpression` type alias for position parameters.
- **Validation**: Rejects early with descriptive errors for missing inputs, invalid time ranges (`start >= end`), and non-positive widths.
- **Naming**: camelCase parameters (`srcVideo`, `srcImage`) and function name per TypeScript conventions.
- **Documentation**: Full JSDoc with `@example`, `@throws`, and `@param` tags.
