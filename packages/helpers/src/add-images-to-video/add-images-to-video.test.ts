import { execFile } from 'child_process';
import {
  addImagesToVideo,
  stripMediaPrefix,
  buildMultiImageFfmpegArgs,
} from './index';

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
// buildMultiImageFfmpegArgs
// ---------------------------------------------------------------------------
describe('buildMultiImageFfmpegArgs', () => {
  const defaultImages = [
    { srcImage: 'a.png', start: 0, end: 5, x: '10', y: '20', width: 200 },
    { srcImage: 'b.png', start: 3, end: 8, x: '50', y: '50', width: 300 },
  ];

  function buildDefault(): string[] {
    return buildMultiImageFfmpegArgs(
      '/media/v.mp4',
      ['/media/people/a.png', '/media/people/b.png'],
      '/media/out.mp4',
      defaultImages,
    );
  }

  it('includes -y to overwrite output without prompting', () => {
    const args = buildDefault();
    expect(args[0]).toBe('-y');
  });

  it('passes the video and all image files via -i flags', () => {
    const args = buildDefault();
    const iFlags = args.reduce<number[]>(
      (acc, val, i) => (val === '-i' ? [...acc, i] : acc),
      [],
    );
    expect(iFlags).toHaveLength(3); // 1 video + 2 images
    expect(args[iFlags[0]! + 1]).toBe('/media/v.mp4');
    expect(args[iFlags[1]! + 1]).toBe('/media/people/a.png');
    expect(args[iFlags[2]! + 1]).toBe('/media/people/b.png');
  });

  it('builds a filter_complex with setsar, scale and overlay chains', () => {
    const args = buildDefault();
    const fcIndex = args.indexOf('-filter_complex');
    expect(fcIndex).toBeGreaterThan(-1);
    const filterValue = args[fcIndex + 1]!;
    expect(filterValue).toContain('[0:v]setsar=1[base]');
    expect(filterValue).toContain('scale=200:-1');
    expect(filterValue).toContain('scale=300:-1');
    expect(filterValue).toContain("enable='between(t,0,5)'");
    expect(filterValue).toContain("enable='between(t,3,8)'");
  });

  it('chains overlays so first uses [base] and last outputs [outv]', () => {
    const args = buildDefault();
    const fcIndex = args.indexOf('-filter_complex');
    const filterValue = args[fcIndex + 1]!;
    expect(filterValue).toContain('[base][img1]overlay=');
    expect(filterValue).toContain('[v1][img2]overlay=');
    expect(filterValue).toMatch(/\[outv\]$/);
  });

  it('includes -map [outv] and audio passthrough flags', () => {
    const args = buildDefault();
    const mapIndex = args.indexOf('-map');
    expect(args[mapIndex + 1]).toBe('[outv]');
    expect(args).toContain('0:a?');
    expect(args).toContain('-c:a');
    expect(args).toContain('copy');
  });

  it('places the destination path as the last argument', () => {
    const args = buildDefault();
    expect(args[args.length - 1]).toBe('/media/out.mp4');
  });

  it('works correctly with a single image', () => {
    const args = buildMultiImageFfmpegArgs(
      '/media/v.mp4',
      ['/media/people/a.png'],
      '/media/out.mp4',
      [{ srcImage: 'a.png', start: 1, end: 3, x: '0', y: '0', width: 100 }],
    );
    const fcIndex = args.indexOf('-filter_complex');
    const filterValue = args[fcIndex + 1]!;
    // Single image: [base][img1]overlay=...[outv]
    expect(filterValue).toContain('[base][img1]overlay=');
    expect(filterValue).toContain('[outv]');
    // Should NOT contain intermediate labels like [v1]
    expect(filterValue).not.toContain('[v1]');
  });
});

// ---------------------------------------------------------------------------
// addImagesToVideo
// ---------------------------------------------------------------------------
describe('addImagesToVideo', () => {
  beforeEach(() => {
    mockedExecFile.mockReset();
  });

  const validImages = [
    { srcImage: 'logo.png', start: 0, end: 5 },
    { srcImage: 'badge.png', start: 3, end: 8 },
  ];

  // -- Validation -----------------------------------------------------------
  describe('input validation', () => {
    it('rejects when srcVideo is empty', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: '',
          dest: 'out.mp4',
          images: validImages,
        }),
      ).rejects.toThrow('srcVideo is required');
    });

    it('rejects when dest is empty', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: '',
          images: validImages,
        }),
      ).rejects.toThrow('dest is required');
    });

    it('rejects when images array is empty', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [],
        }),
      ).rejects.toThrow('images must contain at least one entry');
    });

    it('rejects when an image is missing srcImage', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [{ srcImage: '', start: 0, end: 5 }],
        }),
      ).rejects.toThrow('images[0].srcImage is required');
    });

    it('rejects when an image has negative start', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [{ srcImage: 'a.png', start: -1, end: 5 }],
        }),
      ).rejects.toThrow('images[0].start must be a non-negative finite number');
    });

    it('rejects when an image has NaN start', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [{ srcImage: 'a.png', start: NaN, end: 5 }],
        }),
      ).rejects.toThrow('images[0].start must be a non-negative finite number');
    });

    it('rejects when an image has negative end', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [{ srcImage: 'a.png', start: 0, end: -1 }],
        }),
      ).rejects.toThrow('images[0].end must be a non-negative finite number');
    });

    it('rejects when an image has Infinity end', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [{ srcImage: 'a.png', start: 0, end: Infinity }],
        }),
      ).rejects.toThrow('images[0].end must be a non-negative finite number');
    });

    it('rejects when start >= end in an image', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [{ srcImage: 'a.png', start: 5, end: 5 }],
        }),
      ).rejects.toThrow('images[0].start must be less than end');
    });

    it('rejects when start > end in an image', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [{ srcImage: 'a.png', start: 10, end: 3 }],
        }),
      ).rejects.toThrow('images[0].start must be less than end');
    });

    it('rejects when an image has zero width', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [{ srcImage: 'a.png', start: 0, end: 5, width: 0 }],
        }),
      ).rejects.toThrow('images[0].width must be a positive finite number');
    });

    it('rejects when an image has negative width', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [{ srcImage: 'a.png', start: 0, end: 5, width: -100 }],
        }),
      ).rejects.toThrow('images[0].width must be a positive finite number');
    });

    it('includes the correct index in validation error for non-first image', async () => {
      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [
            { srcImage: 'a.png', start: 0, end: 5 },
            { srcImage: '', start: 0, end: 5 },
          ],
        }),
      ).rejects.toThrow('images[1].srcImage is required');
    });
  });

  // -- Successful execution -------------------------------------------------
  describe('successful execution', () => {
    it('resolves with mediaPath and absolutePath on success', async () => {
      simulateExecFile(null);

      const result = await addImagesToVideo({
        srcVideo: 'video.mp4',
        dest: 'output.mp4',
        images: [{ srcImage: 'logo.png', start: 0, end: 5 }],
        outputFolder: '/test/media',
      });

      expect(result.mediaPath).toBe('media/output.mp4');
      expect(result.absolutePath).toBe('/test/media/output.mp4');
    });

    it('strips media/ prefix from input paths', async () => {
      simulateExecFile(null);

      await addImagesToVideo({
        srcVideo: 'media/video.mp4',
        dest: 'media/output.mp4',
        images: [{ srcImage: 'media/logo.png', start: 0, end: 5 }],
        outputFolder: '/test/media',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      expect(args).toContain('/test/media/video.mp4');
      expect(args).toContain('/test/media/people/logo.png');
      expect(args[args.length - 1]).toBe('/test/media/output.mp4');
    });

    it('uses execFile (not exec) to avoid shell injection', async () => {
      simulateExecFile(null);

      await addImagesToVideo({
        srcVideo: 'video.mp4',
        dest: 'output.mp4',
        images: [{ srcImage: 'logo.png', start: 0, end: 5 }],
        outputFolder: '/test',
      });

      expect(mockedExecFile).toHaveBeenCalledTimes(1);
      expect(mockedExecFile.mock.calls[0][0]).toBe('ffmpeg');
    });

    it('applies default values for optional image fields', async () => {
      simulateExecFile(null);

      await addImagesToVideo({
        srcVideo: 'v.mp4',
        dest: 'out.mp4',
        images: [{ srcImage: 'logo.png' }],
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const fcIndex = args.indexOf('-filter_complex');
      const filterValue = args[fcIndex + 1]!;
      expect(filterValue).toContain('scale=200:-1');
      expect(filterValue).toContain("enable='between(t,0,2)'");
      expect(filterValue).toContain(
        'overlay=(main_w-overlay_w)/2:main_h-overlay_h',
      );
    });

    it('uses custom values for image fields', async () => {
      simulateExecFile(null);

      await addImagesToVideo({
        srcVideo: 'v.mp4',
        dest: 'out.mp4',
        images: [
          {
            srcImage: 'logo.png',
            start: 3,
            end: 10,
            x: '50',
            y: '60',
            width: 400,
          },
        ],
        outputFolder: '/test',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      const fcIndex = args.indexOf('-filter_complex');
      const filterValue = args[fcIndex + 1]!;
      expect(filterValue).toContain('scale=400:-1');
      expect(filterValue).toContain("enable='between(t,3,10)'");
      expect(filterValue).toContain('overlay=50:60');
    });

    it('resolves image paths under the people/ subfolder', async () => {
      simulateExecFile(null);

      await addImagesToVideo({
        srcVideo: 'v.mp4',
        dest: 'out.mp4',
        images: [{ srcImage: 'avatar.png', start: 0, end: 5 }],
        outputFolder: '/test/media',
      });

      const args: string[] = mockedExecFile.mock.calls[0][1];
      expect(args).toContain('/test/media/people/avatar.png');
    });
  });

  // -- Error handling -------------------------------------------------------
  describe('error handling', () => {
    it('rejects with a descriptive message when ffmpeg fails', async () => {
      simulateExecFile(new Error('Command failed: exit code 1'));

      await expect(
        addImagesToVideo({
          srcVideo: 'v.mp4',
          dest: 'out.mp4',
          images: [{ srcImage: 'a.png', start: 0, end: 5 }],
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

      await addImagesToVideo({
        srcVideo: 'v.mp4',
        dest: 'out.mp4',
        images: [{ srcImage: 'a.png', start: 0, end: 5 }],
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

      await addImagesToVideo({
        srcVideo: 'v.mp4',
        dest: 'out.mp4',
        images: [{ srcImage: 'a.png', start: 0, end: 5 }],
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
