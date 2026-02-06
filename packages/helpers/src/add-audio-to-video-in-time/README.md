# add-audio-to-video-in-time

Merges an audio file into a video at a specified time offset using **ffmpeg**.

## Prerequisites

- [ffmpeg](https://ffmpeg.org/) must be installed and available on `PATH`.

## Usage

```ts
import { addAudioToVideoInTime } from '@ai-www/helpers';

const result = await addAudioToVideoInTime({
  srcVideo: 'intro.mp4',
  srcAudio: 'narration.wav',
  dest: 'intro-with-narration.mp4',
  offset: 5, // audio starts at 5 seconds
});

console.log(result.mediaPath);   // 'media/intro-with-narration.mp4'
console.log(result.absolutePath); // '/app/media/intro-with-narration.mp4'
```

## Options

| Parameter      | Type                        | Default                                              | Description                                                     |
| -------------- | --------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| `srcVideo`     | `string`                    | *required*                                           | Path to the source video file (relative to the media folder).   |
| `srcAudio`     | `string`                    | *required*                                           | Path to the source audio file (relative to the media folder).   |
| `dest`         | `string`                    | *required*                                           | Output file path (relative to the media folder).                |
| `offset`       | `number`                    | `0`                                                  | Time offset (seconds) at which the audio begins in the video.   |
| `format`       | `'wav' \| 'mp3' \| 'ogg'`  | `'wav'`                                              | Source audio format. WAV is re-encoded to AAC; others are copied.|
| `outputFolder` | `string`                    | `'/app/media'` (prod) or `'public/media'` (non-prod) | Base directory for all media files.                             |

## How it works

1. Resolves absolute file paths by joining `outputFolder` with each input path (stripping any leading `media/` prefix).
2. Builds an ffmpeg argument list that:
   - Copies the video stream without re-encoding (`-c:v copy`).
   - Re-encodes WAV audio to AAC (`-c:a aac`) for container compatibility, or copies MP3/OGG streams directly (`-c:a copy`).
   - Offsets the audio track by the specified number of seconds (`-itsoffset`).
3. Executes ffmpeg via `execFile` (argument array — safe from shell injection).

## Improvements over the original

- **Security**: Uses `execFile` with an argument array instead of `exec` with string interpolation, eliminating shell injection risks.
- **Bug fix**: `replaceAll('media/', '')` replaced with a regex that only strips a leading `media/` prefix — no longer corrupts paths containing `media/` mid-string.
- **Bug fix**: Non-WAV formats now include explicit stream-mapping flags (`-map 0:v -map 1:a -c:a copy`) instead of omitting them, which caused ffmpeg to fall back to default (potentially incorrect) stream selection.
- **Typing**: `offset` is strictly `number` (the original accepted `string | number`). Named result type instead of a bare `string`.
- **Naming**: camelCase parameters and function name per TypeScript conventions.
- **Validation**: Rejects early with descriptive errors for missing or invalid inputs.
- **Documentation**: Full JSDoc with `@example`, `@throws`, and `@param` tags.
