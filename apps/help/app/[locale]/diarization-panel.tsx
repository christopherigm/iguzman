'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Card } from '@repo/ui/core-elements/card';
import { Typography } from '@repo/ui/core-elements/typography';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { CodeBlock } from '@repo/ui/core-elements/code-block';
import { Toast } from '@repo/ui/core-elements/toast';

const DIARIZATION_BASE = 'https://diarization.iguzman.com.mx';
const LS_KEY = 'diarization-api-key';

const HEALTH_CURL = `curl ${DIARIZATION_BASE}/health`;
const HEALTH_RESPONSE = `{ "status": "ok" }`;

const DIARIZE_CURL =
  `curl -X POST ${DIARIZATION_BASE}/diarize \\\n` +
  `  -H "X-API-Key: YOUR_API_KEY" \\\n` +
  `  -F "file=@audio.wav" \\\n` +
  `  -F "num_speakers=2"`;

const DIARIZE_RESPONSE = JSON.stringify(
  { job_id: 'a1b2c3d4-e5f6-...', status: 'queued' },
  null,
  2,
);

const TRANSCRIBE_CURL =
  `curl -X POST ${DIARIZATION_BASE}/transcribe \\\n` +
  `  -H "X-API-Key: YOUR_API_KEY" \\\n` +
  `  -F "file=@audio.wav" \\\n` +
  `  -F "language=en" \\\n` +
  `  -F "num_speakers=2"`;

const TRANSCRIBE_RESPONSE = JSON.stringify(
  { job_id: 'a1b2c3d4-e5f6-...', status: 'queued' },
  null,
  2,
);

const JOBS_CURL =
  `curl ${DIARIZATION_BASE}/jobs/JOB_ID \\\n` +
  `  -H "X-API-Key: YOUR_API_KEY"`;

const JOBS_RESPONSE_DONE = JSON.stringify(
  {
    job_id: 'a1b2c3d4-e5f6-...',
    status: 'done',
    result: {
      segments: [
        { speaker: 'SPEAKER_00', start: 0.5, end: 3.2 },
        { speaker: 'SPEAKER_01', start: 3.5, end: 6.8 },
      ],
    },
    error: null,
  },
  null,
  2,
);

type Segment = { speaker: string; start: number; end: number; text?: string };
type ErrorState = { msg: string; id: number } | null;

function toSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    `${String(h).padStart(2, '0')}:` +
    `${String(m).padStart(2, '0')}:` +
    `${String(s).padStart(2, '0')},` +
    `${String(ms).padStart(3, '0')}`
  );
}

function toSrt(segments: Segment[]): string {
  return segments
    .map((seg, i) => {
      const line = seg.text ? `${seg.speaker}: ${seg.text}` : seg.speaker;
      return `${i + 1}\n${toSrtTime(seg.start)} --> ${toSrtTime(seg.end)}\n${line}`;
    })
    .join('\n\n');
}

export function DiarizationPanel() {
  const t = useTranslations('HomePage');

  const [apiKey, setApiKey] = useState('');

  // health
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<ErrorState>(null);

  // diarize
  const diarizeFileRef = useRef<HTMLInputElement>(null);
  const [diarizeFile, setDiarizeFile] = useState<File | null>(null);
  const [diarizeNumSpeakers, setDiarizeNumSpeakers] = useState('');
  const [diarizeMinSpeakers, setDiarizeMinSpeakers] = useState('');
  const [diarizeMaxSpeakers, setDiarizeMaxSpeakers] = useState('');
  const [diarizeLoading, setDiarizeLoading] = useState(false);
  const [diarizeResult, setDiarizeResult] = useState<string | null>(null);
  const [diarizeError, setDiarizeError] = useState<ErrorState>(null);

  // transcribe
  const transcribeFileRef = useRef<HTMLInputElement>(null);
  const [transcribeFile, setTranscribeFile] = useState<File | null>(null);
  const [transcribeLanguage, setTranscribeLanguage] = useState('');
  const [transcribeNumSpeakers, setTranscribeNumSpeakers] = useState('');
  const [transcribeMinSpeakers, setTranscribeMinSpeakers] = useState('');
  const [transcribeMaxSpeakers, setTranscribeMaxSpeakers] = useState('');
  const [transcribeLoading, setTranscribeLoading] = useState(false);
  const [transcribeResult, setTranscribeResult] = useState<string | null>(null);
  const [transcribeLanguageDetected, setTranscribeLanguageDetected] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<ErrorState>(null);

  useEffect(() => {
    setApiKey(localStorage.getItem(LS_KEY) ?? '');
  }, []);

  const handleApiKeyChange = (v: string) => {
    setApiKey(v);
    localStorage.setItem(LS_KEY, v);
  };

  const runHealth = async () => {
    setHealthLoading(true);
    setHealthResult(null);
    setHealthError(null);
    try {
      const res = await fetch(`${DIARIZATION_BASE}/health`);
      const text = await res.text();
      setHealthResult(text);
      if (!res.ok) {
        setHealthError({ msg: t('diarizationErrorServer', { status: res.status }), id: Date.now() });
      }
    } catch {
      setHealthError({ msg: t('diarizationErrorNetwork'), id: Date.now() });
    } finally {
      setHealthLoading(false);
    }
  };

  const runDiarize = async () => {
    if (!diarizeFile) return;
    setDiarizeLoading(true);
    setDiarizeResult(null);
    setDiarizeError(null);
    try {
      const form = new FormData();
      form.append('file', diarizeFile);
      if (diarizeNumSpeakers) form.append('num_speakers', diarizeNumSpeakers);
      if (diarizeMinSpeakers) form.append('min_speakers', diarizeMinSpeakers);
      if (diarizeMaxSpeakers) form.append('max_speakers', diarizeMaxSpeakers);
      const res = await fetch(`${DIARIZATION_BASE}/diarize`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: form,
      });
      if (res.status === 401) {
        setDiarizeError({ msg: t('diarizationErrorUnauthorized'), id: Date.now() });
        return;
      }
      if (!res.ok) {
        setDiarizeError({ msg: t('diarizationErrorServer', { status: res.status }), id: Date.now() });
        return;
      }
      const { job_id } = (await res.json()) as { job_id: string };

      let segments: Segment[] | null = null;
      for (let i = 0; i < 200; i++) {
        await new Promise<void>((r) => setTimeout(r, 3000));
        const pollRes = await fetch(`${DIARIZATION_BASE}/jobs/${job_id}`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (pollRes.status === 401) {
          setDiarizeError({ msg: t('diarizationErrorUnauthorized'), id: Date.now() });
          return;
        }
        if (!pollRes.ok) {
          setDiarizeError({ msg: t('diarizationErrorServer', { status: pollRes.status }), id: Date.now() });
          return;
        }
        const job = (await pollRes.json()) as {
          status: string;
          result: { segments: Segment[] } | null;
          error: string | null;
        };
        if (job.status === 'done') { segments = job.result?.segments ?? []; break; }
        if (job.status === 'error') {
          setDiarizeError({ msg: t('diarizationErrorJobFailed', { error: job.error ?? '' }), id: Date.now() });
          return;
        }
      }
      if (segments === null) {
        setDiarizeError({ msg: t('diarizationErrorTimeout'), id: Date.now() });
        return;
      }
      setDiarizeResult(toSrt(segments));
    } catch {
      setDiarizeError({ msg: t('diarizationErrorNetwork'), id: Date.now() });
    } finally {
      setDiarizeLoading(false);
    }
  };

  const runTranscribe = async () => {
    if (!transcribeFile) return;
    setTranscribeLoading(true);
    setTranscribeResult(null);
    setTranscribeLanguageDetected(null);
    setTranscribeError(null);
    try {
      const form = new FormData();
      form.append('file', transcribeFile);
      if (transcribeLanguage) form.append('language', transcribeLanguage);
      if (transcribeNumSpeakers) form.append('num_speakers', transcribeNumSpeakers);
      if (transcribeMinSpeakers) form.append('min_speakers', transcribeMinSpeakers);
      if (transcribeMaxSpeakers) form.append('max_speakers', transcribeMaxSpeakers);
      const res = await fetch(`${DIARIZATION_BASE}/transcribe`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: form,
      });
      if (res.status === 401) {
        setTranscribeError({ msg: t('diarizationErrorUnauthorized'), id: Date.now() });
        return;
      }
      if (!res.ok) {
        setTranscribeError({ msg: t('diarizationErrorServer', { status: res.status }), id: Date.now() });
        return;
      }
      const { job_id } = (await res.json()) as { job_id: string };

      let result: { segments: Segment[]; language: string | null } | null = null;
      for (let i = 0; i < 200; i++) {
        await new Promise<void>((r) => setTimeout(r, 3000));
        const pollRes = await fetch(`${DIARIZATION_BASE}/jobs/${job_id}`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (pollRes.status === 401) {
          setTranscribeError({ msg: t('diarizationErrorUnauthorized'), id: Date.now() });
          return;
        }
        if (!pollRes.ok) {
          setTranscribeError({ msg: t('diarizationErrorServer', { status: pollRes.status }), id: Date.now() });
          return;
        }
        const job = (await pollRes.json()) as {
          status: string;
          result: { segments: Segment[]; language: string | null } | null;
          error: string | null;
        };
        if (job.status === 'done') { result = job.result; break; }
        if (job.status === 'error') {
          setTranscribeError({ msg: t('diarizationErrorJobFailed', { error: job.error ?? '' }), id: Date.now() });
          return;
        }
      }
      if (result === null) {
        setTranscribeError({ msg: t('diarizationErrorTimeout'), id: Date.now() });
        return;
      }
      setTranscribeResult(toSrt(result.segments));
      setTranscribeLanguageDetected(result.language ?? null);
    } catch {
      setTranscribeError({ msg: t('diarizationErrorNetwork'), id: Date.now() });
    } finally {
      setTranscribeLoading(false);
    }
  };

  return (
    <>
      <Box flexDirection="column" gap={8} marginBottom={40}>
        <Typography as="h2" variant="h3">{t('diarizationSection')}</Typography>
        <Typography as="p" variant="body-sm" color="var(--foreground-muted)">
          {t('diarizationIntro')}
        </Typography>
      </Box>

      {/* GET /health */}
      <EndpointPanel heading={t('diarizationHealthSection')} description={t('diarizationHealthDescription')}>
        <DocLabel>{t('diarizationExampleRequest')}</DocLabel>
        <CodeBlock language="bash" code={HEALTH_CURL} />
        <DocLabel>{t('diarizationExampleResponse')}</DocLabel>
        <CodeBlock language="json" code={HEALTH_RESPONSE} />
        <Button
          text={t('diarizationRunButton')}
          size="md"
          kind="success"
          isLoading={healthLoading}
          onClick={runHealth}
        />
        {healthResult !== null && <CodeBlock language="json" code={healthResult} marginTop={4} />}
      </EndpointPanel>
      {healthError && <Toast message={healthError.msg} variant="error" key={healthError.id} />}

      {/* POST /diarize */}
      <EndpointPanel heading={t('diarizationDiarizeSection')} description={t('diarizationDiarizeDescription')}>
        <DocLabel>{t('diarizationExampleRequest')}</DocLabel>
        <CodeBlock language="bash" code={DIARIZE_CURL} />
        <DocLabel>{t('diarizationExampleResponse')}</DocLabel>
        <CodeBlock language="json" code={DIARIZE_RESPONSE} />
        <TextInput
          label={t('diarizationApiKeyLabel')}
          value={apiKey}
          onChange={handleApiKeyChange}
          type="password"
        />
        <FilePicker
          fileRef={diarizeFileRef}
          file={diarizeFile}
          onFile={setDiarizeFile}
          buttonText={t('diarizationChooseFileBtn')}
          noFileText={t('diarizationNoFileChosen')}
        />
        <Box display="flex" gap={12}>
          <TextInput
            label={t('diarizationNumSpeakersLabel')}
            value={diarizeNumSpeakers}
            onChange={setDiarizeNumSpeakers}
            type="number"
          />
          <TextInput
            label={t('diarizationMinSpeakersLabel')}
            value={diarizeMinSpeakers}
            onChange={setDiarizeMinSpeakers}
            type="number"
          />
          <TextInput
            label={t('diarizationMaxSpeakersLabel')}
            value={diarizeMaxSpeakers}
            onChange={setDiarizeMaxSpeakers}
            type="number"
          />
        </Box>
        <Button
          text={t('diarizationRunButton')}
          size="md"
          kind="success"
          isLoading={diarizeLoading}
          disabled={!diarizeFile}
          onClick={runDiarize}
        />
        {diarizeResult !== null && (
          <SrtCard label={t('diarizationResultLabel')} srt={diarizeResult} />
        )}
      </EndpointPanel>
      {diarizeError && <Toast message={diarizeError.msg} variant="error" key={diarizeError.id} />}

      {/* POST /transcribe */}
      <EndpointPanel heading={t('diarizationTranscribeSection')} description={t('diarizationTranscribeDescription')}>
        <DocLabel>{t('diarizationExampleRequest')}</DocLabel>
        <CodeBlock language="bash" code={TRANSCRIBE_CURL} />
        <DocLabel>{t('diarizationExampleResponse')}</DocLabel>
        <CodeBlock language="json" code={TRANSCRIBE_RESPONSE} />
        <TextInput
          label={t('diarizationApiKeyLabel')}
          value={apiKey}
          onChange={handleApiKeyChange}
          type="password"
        />
        <FilePicker
          fileRef={transcribeFileRef}
          file={transcribeFile}
          onFile={setTranscribeFile}
          buttonText={t('diarizationChooseFileBtn')}
          noFileText={t('diarizationNoFileChosen')}
        />
        <TextInput
          label={t('diarizationLanguageLabel')}
          value={transcribeLanguage}
          onChange={setTranscribeLanguage}
          placeholder="en"
        />
        <Box display="flex" gap={12}>
          <TextInput
            label={t('diarizationNumSpeakersLabel')}
            value={transcribeNumSpeakers}
            onChange={setTranscribeNumSpeakers}
            type="number"
          />
          <TextInput
            label={t('diarizationMinSpeakersLabel')}
            value={transcribeMinSpeakers}
            onChange={setTranscribeMinSpeakers}
            type="number"
          />
          <TextInput
            label={t('diarizationMaxSpeakersLabel')}
            value={transcribeMaxSpeakers}
            onChange={setTranscribeMaxSpeakers}
            type="number"
          />
        </Box>
        <Button
          text={t('diarizationRunButton')}
          size="md"
          kind="success"
          isLoading={transcribeLoading}
          disabled={!transcribeFile}
          onClick={runTranscribe}
        />
        {transcribeResult !== null && (
          <SrtCard
            label={t('diarizationResultLabel')}
            srt={transcribeResult}
            detectedLanguage={
              transcribeLanguageDetected
                ? t('diarizationDetectedLanguage', { lang: transcribeLanguageDetected })
                : undefined
            }
          />
        )}
      </EndpointPanel>
      {transcribeError && <Toast message={transcribeError.msg} variant="error" key={transcribeError.id} />}

      {/* GET /jobs/:job_id */}
      <EndpointPanel heading={t('diarizationJobsSection')} description={t('diarizationJobsDescription')}>
        <DocLabel>{t('diarizationExampleRequest')}</DocLabel>
        <CodeBlock language="bash" code={JOBS_CURL} />
        <DocLabel>{t('diarizationExampleResponse')}</DocLabel>
        <CodeBlock language="json" code={JOBS_RESPONSE_DONE} />
      </EndpointPanel>
    </>
  );
}

// ── Local helpers ─────────────────────────────────────────────────────────────

function FilePicker({
  fileRef,
  file,
  onFile,
  buttonText,
  noFileText,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  file: File | null;
  onFile: (f: File | null) => void;
  buttonText: string;
  noFileText: string;
}) {
  return (
    <Box display="flex" alignItems="center" gap={12}>
      <Button size="md" text={buttonText} onClick={() => fileRef.current?.click()} />
      <Typography as="span" variant="body-sm" color="var(--foreground-muted)">
        {file ? file.name : noFileText}
      </Typography>
      <input
        ref={fileRef}
        type="file"
        accept=".wav,.mp3,.mp4,.m4a,.flac,.ogg,.webm"
        aria-hidden="true"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </Box>
  );
}

function SrtCard({
  label,
  srt,
  detectedLanguage,
}: {
  label: string;
  srt: string;
  detectedLanguage?: string;
}) {
  return (
    <Card marginTop={4}>
      {detectedLanguage && (
        <Typography
          as="p"
          variant="caption"
          color="var(--foreground-muted)"
          marginBottom={8}
        >
          {detectedLanguage}
        </Typography>
      )}
      <Typography
        as="p"
        variant="none"
        color="var(--foreground-muted)"
        fontWeight={600}
        marginBottom={8}
        styles={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}
      >
        {label}
      </Typography>
      <Typography
        as="p"
        variant="caption"
        styles={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      >
        {srt}
      </Typography>
    </Card>
  );
}

function DocLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      as="p"
      variant="none"
      color="var(--foreground-muted)"
      fontWeight={600}
      marginTop={8}
      styles={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}
    >
      {children}
    </Typography>
  );
}

function EndpointPanel({
  heading,
  description,
  children,
}: {
  heading: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Box flexDirection="column" marginBottom={40}>
      <Typography as="h2" variant="h3" marginBottom={8}>{heading}</Typography>
      <Typography as="p" variant="body-sm" color="var(--foreground-muted)" marginBottom={16}>
        {description}
      </Typography>
      <Box display="flex" flexDirection="column" gap={12}>
        {children}
      </Box>
    </Box>
  );
}
