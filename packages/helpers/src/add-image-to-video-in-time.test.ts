import { execFile } from 'child_process';
import {
  addImageToVideoInTime,
  stripMediaPrefix,
  buildFfmpegArgs,
} from './add-image-to-video-in-time';

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
  const defaults = {
    srcVideoFile: '/media/v.mp4',
    srcImageFile: '/media/img.png',
    destFile: '/media/out.mp4',
    start: 0,
    end: 5,
    x: '(main_w-overlay_w)/2',
    y: 'main_h-overlay_h',
    width: 200,
  };

  function buildDefault(overrides: Partial<typeof defaults> = {}): string[] {
    const o = { ...defaults, ...overrides };
    return buildFfmpegArgs(
      o.srcVideoFile,
      o.srcImageFile,
      o.destFile,
      o.start,
      o.end,
      o.x,
      o.y,
      o.width,
    );
  }

  it('includes -y to overwrite output without prompting', () => {
    const args = buildDefault();
    expect(args[0]).toBe('-y');
  });

  it('passes both input files via -i flags', () => {
    const args = buildDefault();
    const iFlags = args.reduce<number[]>(
      (acc, val, i) => (val === '-i' ? [...acc, i] : acc),
      [],
    );
    expect(iFlags).toHaveLength(2);
    expect(args[iFlags[0]! + 1]).toBe(defaults.srcVideoFile);
    expect(args[iFlags[1]! + 1]).toBe(defaults.srcImageFile);
  });

  it('builds a filter_complex with scale and overlay', () => {
    const args = buildDefault({ width: 300, start: 2, end: 8 });
    const fcIndex = args.indexOf('-filter_complex');
    expect(fcIndex).toBeGreaterThan(-1);
    const filterValue = args[fcIndex + 1]!;
    expect(filterValue).toContain('scale=300:-1');
    expect(filterValue).toContain("enable='between(t,2,8)'");
  });

  it('includes the overlay position expressions', () => {
    const args = buildDefault({ x: '10', y: '20' });
    const fcIndex = args.indexOf('-filter_complex');
    const filterValue = args[fcIndex + 1]!;
    expect(filterValue).toContain('overlay=10:20');
  });

  it('places the destination path as the last argument', () => {
    const args = buildDefault();
    expect(args[args.length - 1]).toBe(defaults.destFile);
  });
});

// ---------------------------------------------------------------------------
// addImageToVideoInTime
// ---------------------------------------------------------------------------
describe('addImageToVideoInTime', () => {
  beforeEach(() => {
    mockedExecFile.mockReset();
  });

  // -- Validation -----------------------------------------------------------
  describe('input validation', () => {
    it('rejects when srcVideo is empty', async () => {
      await expect(
        addImageToVideoInTime({
          srcVideo: '',
          srcImage: 'img.png',
          dest: 'out.mp4',
        }),
      ).rejects.toThrow('srcVideo is required');
    });

    it('rejects when srcImage is empty', async () => {
      await expect(
        addImageToVideoInTime({
          srcVideo: 'v.mp4',
          srcImage: '',
          dest: 'out.mp4',
        }),
      ).rejects.toThrow('srcImage is required');
    });

    it('rejects when dest is empty', async () => {
      await expect(
        addImageToVideoInTime({
          srcVideo: 'v.mp4',
          srcImage: 'img.png',
          dest: '',
        }),
      ).rejects.toThrow('dest is required');
    });

    it('rejects when start is negative', async () => {
      await expect(
        addImageToVideoInTime({
          srcVideo: 'v.mp4',
          srcImage: 'img.png',
          dest: 'out.mp4',
          start: -1,
        }),
      ).rejects.toThrow('start must be a non-negative finite number');
    });

    it('rejects when start is NaN', async () => {
      await expect(
        addImageToVideoInTime({
          srcVideo: 'v.mp4',
          srcImage: 'img.png',
          dest: 'out.mp4',
          start: NaN,
        }),
      ).rejects.toThrow('start must be a non-negative finite number');
    });

    it('rejects when end is negative', async () => {
      await expect(
        addImageToVideoInTime({
          srcVideo: 'v.mp4',
          srcImage: 'img.png',
          dest: 'out.mp4',
          end: -1,
        }),
      ).rejects.toThrow('end must be a non-negative finite number');
    });

    it('rejects when end is Infinity', async () => {
      await expect(
        addImageToVideoInTime({
          srcVideo: 'v.mp4',
          srcImage: 'img.png',
          dest: 'out.mp4',
          end: Infinity,
        }),
      ).rejects.toThrow('end must be a non-negative finite number');
    });

    it('rejects when start >= end', async () => {
      await expect(
        addImageToVideoInTime({
          srcVideo: 'v.mp4',
          srcImage: 'img.png',
          dest: 'out.mp4',
          start: 5,
          end: 5,
        }),
      ).rejects.toThrow('start must be less than end');
    });

    it('rejects when start > end', async () => {
      await expect(
        addImageToVideoInTime({
          srcVideo: 'v.mp4',
          srcImage: 'img.png',
          dest: 'out.mp4',
          start: 10,
          end: 5,
        }),
      ).rejects.toThrow('start must be less than end');
    });

    it('rejects when width is zero', async () => {
      await expect(
        addImageToVideoInTime({
          srcVideo: 'v.mp4',
          srcImage: 'img.png',
          dest: 'out.mp4',
          width: 0,
        }),
      ).rejects.toThrow('width must be a positive finite number');
    });

    it('rejects when width is negative', async () => {
      await expect(
        addImageToVideoInTime({
          srcVideo: 'v.mp4',
          srcImage: 'img.png',
          dest: 'out.mp4',
          width: -100,
        }),
      ).rejects.toThrow('width must be a positive finite number');
    });
  });

  // -- Successful execution -------------------------------------------------
  describe('successful execution', () => {
    it('resolves with mediaPath and absolutePath on success', async () => {
      simulateExecFile(null);

      const result = await addImageToVideoInTime({
        srcVideo: 'video.mp4',
        srcImage: 'logo.png',
        dest: 'output.mp4',
        outputFolder: '/test/media',
      });

      expect(result.mediaPath).toBe('media/output.mp4');
      expect(result.absolutePath).toBe('/test/media/output.mp4');
    });

    it('strips media/ prefix from input paths', async () => {
      simulateExecFile(null);

      await addImageToVideoInTime({
        srcVideo: 'media/video.mp4',
        srcImage: 'media/logo.png',
        dest: 'media/output.mp4',
        outputFolder: '/test/media',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      // Source paths should not have double media/
      expect(args).toContain('/test/media/video.mp4');
      expect(args).toContain('/test/media/logo.png');
      expect(args[args.length - 1]).toBe('/test/media/output.mp4');
    });

    it('uses execFile (not exec) to avoid shell injection', async () => {
      simulateExecFile(null);

      await addImageToVideoInTime({
        srcVideo: 'video.mp4',
        srcImage: 'logo.png',
        dest: 'output.mp4',
        outputFolder: '/test',
      });

      expect(mockedExecFile).toHaveBeenCalledTimes(1);
      expect(mockedExecFile.mock.calls[0][0]).toBe('ffmpeg');
    });

    it('defaults start to 0 and end to 2', async () => {
      simulateExecFile(null);

      await addImageToVideoInTime({
        srcVideo: 'v.mp4',
        srcImage: 'img.png',
        dest: 'out.mp4',
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const fcIndex = args.indexOf('-filter_complex');
      const filterValue = args[fcIndex + 1]!;
      expect(filterValue).toContain("enable='between(t,0,2)'");
    });

    it('passes custom start and end to the filter', async () => {
      simulateExecFile(null);

      await addImageToVideoInTime({
        srcVideo: 'v.mp4',
        srcImage: 'img.png',
        dest: 'out.mp4',
        start: 3.5,
        end: 12,
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const fcIndex = args.indexOf('-filter_complex');
      const filterValue = args[fcIndex + 1]!;
      expect(filterValue).toContain("enable='between(t,3.5,12)'");
    });

    it('defaults width to 200', async () => {
      simulateExecFile(null);

      await addImageToVideoInTime({
        srcVideo: 'v.mp4',
        srcImage: 'img.png',
        dest: 'out.mp4',
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const fcIndex = args.indexOf('-filter_complex');
      const filterValue = args[fcIndex + 1]!;
      expect(filterValue).toContain('scale=200:-1');
    });

    it('uses custom width for image scaling', async () => {
      simulateExecFile(null);

      await addImageToVideoInTime({
        srcVideo: 'v.mp4',
        srcImage: 'img.png',
        dest: 'out.mp4',
        width: 500,
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const fcIndex = args.indexOf('-filter_complex');
      const filterValue = args[fcIndex + 1]!;
      expect(filterValue).toContain('scale=500:-1');
    });

    it('uses custom x and y overlay positions', async () => {
      simulateExecFile(null);

      await addImageToVideoInTime({
        srcVideo: 'v.mp4',
        srcImage: 'img.png',
        dest: 'out.mp4',
        x: '10',
        y: '20',
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const fcIndex = args.indexOf('-filter_complex');
      const filterValue = args[fcIndex + 1]!;
      expect(filterValue).toContain('overlay=10:20');
    });

    it('defaults overlay to horizontally centred at the bottom', async () => {
      simulateExecFile(null);

      await addImageToVideoInTime({
        srcVideo: 'v.mp4',
        srcImage: 'img.png',
        dest: 'out.mp4',
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const fcIndex = args.indexOf('-filter_complex');
      const filterValue = args[fcIndex + 1]!;
      expect(filterValue).toContain(
        'overlay=(main_w-overlay_w)/2:main_h-overlay_h',
      );
    });
  });

  // -- Error handling -------------------------------------------------------
  describe('error handling', () => {
    it('rejects with a descriptive message when ffmpeg fails', async () => {
      simulateExecFile(new Error('Command failed: exit code 1'));

      await expect(
        addImageToVideoInTime({
          srcVideo: 'v.mp4',
          srcImage: 'img.png',
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

      await addImageToVideoInTime({
        srcVideo: 'v.mp4',
        srcImage: 'img.png',
        dest: 'out.mp4',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      expect(
        args.some(
          (a) => a.startsWith('/app/media/') || a.includes('/app/media/'),
        ),
      ).toBe(true);
    });

    it('uses public/media outside production', async () => {
      process.env.NODE_ENV = 'development';
      simulateExecFile(null);

      await addImageToVideoInTime({
        srcVideo: 'v.mp4',
        srcImage: 'img.png',
        dest: 'out.mp4',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      expect(
        args.some(
          (a) => a.startsWith('public/media/') || a.includes('public/media/'),
        ),
      ).toBe(true);
    });
  });
});
