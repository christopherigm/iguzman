import { execFile } from 'child_process';
import {
  addAudioToVideoInTime,
  stripMediaPrefix,
  buildFfmpegArgs,
} from './add-audio-to-video-in-time';

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

const mockedExecFile = execFile as unknown as jest.Mock;

/**
 * Calls the mocked execFile callback with the given error (or null for success).
 */
function simulateExecFile(error: Error | null = null): void {
  mockedExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: Record<string, unknown>,
      cb: (err: Error | null) => void,
    ) => {
      cb(error);
    },
  );
}

// ---------------------------------------------------------------------------
// stripMediaPrefix
// ---------------------------------------------------------------------------
describe('stripMediaPrefix', () => {
  it('removes a leading media/ prefix', () => {
    expect(stripMediaPrefix('media/video.mp4')).toBe('video.mp4');
  });

  it('leaves paths without a leading media/ prefix unchanged', () => {
    expect(stripMediaPrefix('video.mp4')).toBe('video.mp4');
  });

  it('only strips the first occurrence at the start', () => {
    expect(stripMediaPrefix('media/sub/media/file.mp4')).toBe(
      'sub/media/file.mp4',
    );
  });

  it('does not strip media/ that appears mid-path', () => {
    expect(stripMediaPrefix('assets/media/file.mp4')).toBe(
      'assets/media/file.mp4',
    );
  });
});

// ---------------------------------------------------------------------------
// buildFfmpegArgs
// ---------------------------------------------------------------------------
describe('buildFfmpegArgs', () => {
  it('includes -c:a aac when format is wav', () => {
    const args = buildFfmpegArgs('/v.mp4', '/a.wav', '/out.mp4', 0, 'wav');
    expect(args).toContain('-c:a');
    const codecIndex = args.indexOf('-c:a');
    expect(args[codecIndex + 1]).toBe('aac');
  });

  it('includes -c:a copy when format is mp3', () => {
    const args = buildFfmpegArgs('/v.mp4', '/a.mp3', '/out.mp4', 0, 'mp3');
    const codecIndex = args.indexOf('-c:a');
    expect(args[codecIndex + 1]).toBe('copy');
  });

  it('includes -c:a copy when format is ogg', () => {
    const args = buildFfmpegArgs('/v.mp4', '/a.ogg', '/out.mp4', 0, 'ogg');
    const codecIndex = args.indexOf('-c:a');
    expect(args[codecIndex + 1]).toBe('copy');
  });

  it('always maps video from first input and audio from second', () => {
    const args = buildFfmpegArgs('/v.mp4', '/a.wav', '/out.mp4', 3, 'wav');
    expect(args).toContain('-map');
    const mapIndices = args.reduce<number[]>(
      (acc, val, i) => (val === '-map' ? [...acc, i] : acc),
      [],
    );
    expect(args[mapIndices[0]! + 1]).toBe('0:v');
    expect(args[mapIndices[1]! + 1]).toBe('1:a');
  });

  it('sets the -itsoffset flag to the provided offset', () => {
    const args = buildFfmpegArgs('/v.mp4', '/a.wav', '/out.mp4', 7.5, 'wav');
    const offsetIndex = args.indexOf('-itsoffset');
    expect(args[offsetIndex + 1]).toBe('7.5');
  });

  it('places the destination path as the last argument', () => {
    const args = buildFfmpegArgs('/v.mp4', '/a.wav', '/dest.mp4', 0, 'wav');
    expect(args[args.length - 1]).toBe('/dest.mp4');
  });

  it('includes -y to overwrite output without prompting', () => {
    const args = buildFfmpegArgs('/v.mp4', '/a.wav', '/out.mp4', 0, 'wav');
    expect(args[0]).toBe('-y');
  });
});

// ---------------------------------------------------------------------------
// addAudioToVideoInTime
// ---------------------------------------------------------------------------
describe('addAudioToVideoInTime', () => {
  beforeEach(() => {
    mockedExecFile.mockReset();
  });

  // -- Validation -----------------------------------------------------------
  describe('input validation', () => {
    it('rejects when srcVideo is empty', async () => {
      await expect(
        addAudioToVideoInTime({
          srcVideo: '',
          srcAudio: 'a.wav',
          dest: 'out.mp4',
        }),
      ).rejects.toThrow('srcVideo is required');
    });

    it('rejects when srcAudio is empty', async () => {
      await expect(
        addAudioToVideoInTime({
          srcVideo: 'v.mp4',
          srcAudio: '',
          dest: 'out.mp4',
        }),
      ).rejects.toThrow('srcAudio is required');
    });

    it('rejects when dest is empty', async () => {
      await expect(
        addAudioToVideoInTime({
          srcVideo: 'v.mp4',
          srcAudio: 'a.wav',
          dest: '',
        }),
      ).rejects.toThrow('dest is required');
    });

    it('rejects when offset is negative', async () => {
      await expect(
        addAudioToVideoInTime({
          srcVideo: 'v.mp4',
          srcAudio: 'a.wav',
          dest: 'out.mp4',
          offset: -1,
        }),
      ).rejects.toThrow('offset must be a non-negative finite number');
    });

    it('rejects when offset is NaN', async () => {
      await expect(
        addAudioToVideoInTime({
          srcVideo: 'v.mp4',
          srcAudio: 'a.wav',
          dest: 'out.mp4',
          offset: NaN,
        }),
      ).rejects.toThrow('offset must be a non-negative finite number');
    });

    it('rejects when offset is Infinity', async () => {
      await expect(
        addAudioToVideoInTime({
          srcVideo: 'v.mp4',
          srcAudio: 'a.wav',
          dest: 'out.mp4',
          offset: Infinity,
        }),
      ).rejects.toThrow('offset must be a non-negative finite number');
    });
  });

  // -- Successful execution -------------------------------------------------
  describe('successful execution', () => {
    it('resolves with mediaPath and absolutePath on success', async () => {
      simulateExecFile(null);

      const result = await addAudioToVideoInTime({
        srcVideo: 'video.mp4',
        srcAudio: 'audio.wav',
        dest: 'output.mp4',
        outputFolder: '/test/media',
      });

      expect(result.mediaPath).toBe('media/output.mp4');
      expect(result.absolutePath).toBe('/test/media/output.mp4');
    });

    it('strips media/ prefix from input paths', async () => {
      simulateExecFile(null);

      await addAudioToVideoInTime({
        srcVideo: 'media/video.mp4',
        srcAudio: 'media/audio.wav',
        dest: 'media/output.mp4',
        outputFolder: '/test/media',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      // Source video path should not have double media/
      expect(args).toContain('/test/media/video.mp4');
      expect(args).toContain('/test/media/audio.wav');
      expect(args[args.length - 1]).toBe('/test/media/output.mp4');
    });

    it('uses execFile (not exec) to avoid shell injection', async () => {
      simulateExecFile(null);

      await addAudioToVideoInTime({
        srcVideo: 'video.mp4',
        srcAudio: 'audio.wav',
        dest: 'output.mp4',
        outputFolder: '/test',
      });

      expect(mockedExecFile).toHaveBeenCalledTimes(1);
      expect(mockedExecFile.mock.calls[0][0]).toBe('ffmpeg');
    });

    it('defaults offset to 0', async () => {
      simulateExecFile(null);

      await addAudioToVideoInTime({
        srcVideo: 'v.mp4',
        srcAudio: 'a.wav',
        dest: 'out.mp4',
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const offsetIndex = args.indexOf('-itsoffset');
      expect(args[offsetIndex + 1]).toBe('0');
    });

    it('passes a custom offset to ffmpeg', async () => {
      simulateExecFile(null);

      await addAudioToVideoInTime({
        srcVideo: 'v.mp4',
        srcAudio: 'a.wav',
        dest: 'out.mp4',
        offset: 12.5,
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const offsetIndex = args.indexOf('-itsoffset');
      expect(args[offsetIndex + 1]).toBe('12.5');
    });

    it('defaults format to wav and encodes audio as aac', async () => {
      simulateExecFile(null);

      await addAudioToVideoInTime({
        srcVideo: 'v.mp4',
        srcAudio: 'a.wav',
        dest: 'out.mp4',
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const codecIndex = args.indexOf('-c:a');
      expect(args[codecIndex + 1]).toBe('aac');
    });

    it('copies audio stream directly for mp3 format', async () => {
      simulateExecFile(null);

      await addAudioToVideoInTime({
        srcVideo: 'v.mp4',
        srcAudio: 'a.mp3',
        dest: 'out.mp4',
        format: 'mp3',
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const codecIndex = args.indexOf('-c:a');
      expect(args[codecIndex + 1]).toBe('copy');
    });
  });

  // -- Error handling -------------------------------------------------------
  describe('error handling', () => {
    it('rejects with a descriptive message when ffmpeg fails', async () => {
      simulateExecFile(new Error('Command failed: exit code 1'));

      await expect(
        addAudioToVideoInTime({
          srcVideo: 'v.mp4',
          srcAudio: 'a.wav',
          dest: 'out.mp4',
          outputFolder: '/test',
        }),
      ).rejects.toThrow('ffmpeg failed: Command failed: exit code 1');
    });
  });

  // -- Environment-based defaults -------------------------------------------
  describe('outputFolder defaults', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('uses /app/media in production', async () => {
      process.env.NODE_ENV = 'production';
      simulateExecFile(null);

      await addAudioToVideoInTime({
        srcVideo: 'v.mp4',
        srcAudio: 'a.wav',
        dest: 'out.mp4',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      expect(args.some((a) => a.startsWith('/app/media/'))).toBe(true);
    });

    it('uses public/media outside production', async () => {
      process.env.NODE_ENV = 'development';
      simulateExecFile(null);

      await addAudioToVideoInTime({
        srcVideo: 'v.mp4',
        srcAudio: 'a.wav',
        dest: 'out.mp4',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      expect(args.some((a) => a.startsWith('public/media/'))).toBe(true);
    });
  });
});
