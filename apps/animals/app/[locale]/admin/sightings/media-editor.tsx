'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Select } from '@repo/ui/core-elements/select';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { GalleryEditor } from '@/components/admin/gallery-editor';
import { sightingMedia } from '@/lib/admin-api';

type Kind = 'link' | 'video';

/**
 * A sighting's **clips**: uploaded video files and video links.
 *
 * The entry's photographs are not here - they are the multi-select uploader at
 * the top of the form (`EntityGalleryField`), where the first one is the entry's
 * cover. The two video kinds stay behind because neither can be handled the way
 * a photo is:
 *
 * - a **link** is just a URL, so there is no file to upload at all;
 * - a **video file** is far past the API's 10 MB JSON-body limit, so it goes as
 *   multipart to its own endpoint, which Django streams to a temp file. Three
 *   limits have to agree for a large one to arrive (the app's
 *   `MAX_VIDEO_UPLOAD_MB`, nginx's `proxy-body-size` and gunicorn's timeout) -
 *   nginx refuses an oversized body *before* Django sees it, so a file over the
 *   ceiling fails with an opaque 413 rather than a readable message.
 *
 * Both are still written **immediately**, one row at a time, rather than on Save
 * like the photos - a streamed multipart upload has nowhere to wait in form
 * state. Adding a clip and then abandoning the form leaves the clip attached.
 *
 * All three kinds share one table and one `sort_order` sequence, but the public
 * entry page renders photos and clips as two separate sections, so the photo
 * uploader renumbering its own rows cannot disturb what is listed here.
 */
export function MediaEditor({ sightingId }: { sightingId: number }) {
  const t = useTranslations('Admin');
  const [kind, setKind] = useState<Kind>('link');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  // Remounts GalleryEditor after a video upload, which is the simplest way to
  // make it re-read a list this component wrote to behind its back.
  const [reloadKey, setReloadKey] = useState(0);

  const handleVideo = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setVideoError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await sightingMedia.uploadVideo(sightingId, form);
      setReloadKey((k) => k + 1);
    } catch {
      setVideoError(t('videoUploadFailed'));
    } finally {
      setUploading(false);
      if (videoInput.current) videoInput.current.value = '';
    }
  };

  return (
    <GalleryEditor
      key={reloadKey}
      titleKey="mediaClips"
      introKey="mediaClipsIntro"
      // The photos of this entry are edited by the uploader above, so they are
      // filtered out here - listing them twice would invite an author to delete
      // a row in one place and still see it in the other.
      list={() =>
        sightingMedia.list(sightingId).then((rows) => rows.filter((row) => row.kind !== 'image'))
      }
      create={(data) => sightingMedia.create(sightingId, data)}
      update={(pk, data) => sightingMedia.update(sightingId, pk, data)}
      remove={(pk) => sightingMedia.remove(sightingId, pk)}
      // Neither kind carries a base64 image, so the shared uploader is hidden
      // and the add button gates on the URL (a video has its own upload path).
      imageless
      addDisabled={kind === 'video' || url.trim() === ''}
      createExtras={{ kind: 'link', url: url.trim() }}
    >
      <Box flexDirection="column" gap={12}>
        <Box maxWidth={260}>
          <Select
            label={t('mediaKind')}
            value={kind}
            onChange={(v) => {
              setKind(v as Kind);
              setUrl('');
              setVideoError(null);
            }}
            options={[
              { value: 'link', label: t('mediaKindLink') },
              { value: 'video', label: t('mediaKindVideo') },
            ]}
          />
        </Box>

        {kind === 'link' && (
          <TextInput
            label={t('mediaUrl')}
            type="url"
            value={url}
            onChange={setUrl}
            helperText={t('mediaUrlHelp')}
          />
        )}

        {kind === 'video' && (
          <Box flexDirection="column" gap={8}>
            {/* Its own upload path, not the shared add button: this is the one
                thing on the page that cannot ride in a JSON body. */}
            <input
              ref={videoInput}
              type="file"
              accept="video/*"
              aria-hidden="true"
              style={{ display: 'none' }}
              onChange={(e) => void handleVideo(e.target.files?.[0] ?? null)}
            />
            <Box>
              <Button
                text={t('mediaChooseVideo')}
                size="md"
                type="button"
                onClick={() => videoInput.current?.click()}
                disabled={uploading}
              />
            </Box>
            <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
              {t('mediaVideoHelp')}
            </Typography>
            {uploading && <ProgressBar label={t('mediaVideoUploading')} />}
            {videoError && (
              <Typography variant="body" color="var(--error, #dc2626)">
                {videoError}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </GalleryEditor>
  );
}
