'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Badge } from '@repo/ui/core-elements/badge';
import { Button } from '@repo/ui/core-elements/button';
import { Spinner } from '@repo/ui/core-elements/spinner';
import { LinkButton } from '@repo/ui/core-elements/link-button';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Toast } from '@repo/ui/core-elements/toast';
import { ApiError, deleteMovie, getMovie, type MovieDetail as MovieDetailData } from '@/lib/catalog';
import './movie-detail.css';

type Status = 'loading' | 'ready' | 'not_found' | 'error';

const LABEL_STYLES = { opacity: 0.6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };

export function MovieDetail({ id }: { id: string }) {
  const t = useTranslations('MovieDetailPage');
  const tFormat = useTranslations('MovieFormat');
  const router = useRouter();
  const [movie, setMovie] = useState<MovieDetailData | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  async function handleConfirmDelete() {
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      await deleteMovie(id);
      router.push('/');
    } catch {
      setDeleting(false);
      setDeleteError(true);
    }
  }

  useEffect(() => {
    let active = true;
    getMovie(id)
      .then((data) => {
        if (!active) return;
        setMovie(data);
        setStatus('ready');
      })
      .catch((err) => {
        if (!active) return;
        setStatus(err instanceof ApiError && err.status === 404 ? 'not_found' : 'error');
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (status === 'loading') {
    return (
      <Box display="flex" justifyContent="center" paddingY={40}>
        <Spinner label={t('loading')} />
      </Box>
    );
  }

  if (status !== 'ready' || !movie) {
    return (
      <Box flexDirection="column" alignItems="center" gap={12} paddingY={40}>
        <Typography variant="body-sm" role="alert">
          {status === 'not_found' ? t('notFound') : t('error')}
        </Typography>
        <LinkButton label={t('back')} href="/" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={20} paddingY={16}>
      {showDeleteConfirm && (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDeleteText', { title: movie.title })}
          okCallback={handleConfirmDelete}
          cancelCallback={() => setShowDeleteConfirm(false)}
        />
      )}

      {deleteError && (
        <Toast
          message={t('deleteError')}
          variant="error"
          position="top-center"
        />
      )}

      <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={8}>
        <LinkButton label={t('back')} href="/" />
        <Button
          text={t('delete')}
          icon="/icons/delete.svg"
          kind="error"
          size="md"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={deleting}
        />
      </Box>

      <Box display="flex" flexDirection="column" className="movie-detail__layout" gap={24}>
        <Box
          width="100%"
          maxWidth={280}
          borderRadius={8}
          styles={{ position: 'relative', overflow: 'hidden', aspectRatio: '2 / 3', flexShrink: 0 }}
        >
          {movie.cover ? (
            <Image
              src={movie.cover}
              alt=""
              fill
              sizes="(max-width: 600px) 100vw, 280px"
              className="movie-detail__image"
            />
          ) : (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              width="100%"
              height="100%"
              backgroundColor="var(--surface-2)"
            >
              <Typography variant="caption" styles={{ opacity: 0.6 }}>
                {t('noCover')}
              </Typography>
            </Box>
          )}
        </Box>

        <Box flexDirection="column" gap={16} flex={1}>
          <Typography as="h1" variant="h2" fontWeight={700}>
            {movie.title}
          </Typography>

          <Box display="flex" gap={8} flexWrap="wrap">
            {movie.year && <Badge variant="subtle">{movie.year}</Badge>}
            {movie.format && <Badge variant="subtle">{tFormat(movie.format)}</Badge>}
          </Box>

          {movie.director && (
            <Box flexDirection="column" gap={2}>
              <Typography variant="label" styles={LABEL_STYLES}>
                {t('director')}
              </Typography>
              <Typography variant="body">{movie.director}</Typography>
            </Box>
          )}

          {movie.genres.length > 0 && (
            <Box flexDirection="column" gap={6}>
              <Typography variant="label" styles={LABEL_STYLES}>
                {t('genres')}
              </Typography>
              <Box display="flex" gap={6} flexWrap="wrap">
                {movie.genres.map((genre) => (
                  <Badge key={genre.id} variant="outlined" size="sm">
                    {genre.name}
                  </Badge>
                ))}
              </Box>
            </Box>
          )}

          {movie.cast.length > 0 && (
            <Box flexDirection="column" gap={6}>
              <Typography variant="label" styles={LABEL_STYLES}>
                {t('cast')}
              </Typography>
              <Typography variant="body-sm">{movie.cast.map((actor) => actor.name).join(', ')}</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
