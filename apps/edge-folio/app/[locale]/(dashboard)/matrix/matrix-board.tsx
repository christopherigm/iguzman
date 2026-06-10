'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Badge } from '@repo/ui/core-elements/badge';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Toast } from '@repo/ui/core-elements/toast';
import { Select } from '@repo/ui/core-elements/select';
import { Slider } from '@repo/ui/core-elements/slider';
import { SpeechButton } from '@repo/ui/core-elements/speech-button';
import { Grid } from '@repo/ui/core-elements/grid';
import { useGroqProxy } from '@repo/ui/use-groq';
import {
  getSkills,
  createSkill,
  deleteSkill,
  getBullets,
  createBullet,
  updateBullet,
  deleteBullet,
  MatrixError,
  type Skill,
  type BulletPoint,
  type Category,
} from '@/lib/matrix';
import './matrix-board.css';

const PARAGRAPH_WORD_COUNTS: Record<string, { min: number; max: number }> = {
  xs:      { min: 10,  max: 20  },
  sm:      { min: 25,  max: 40  },
  md:      { min: 50,  max: 75 },
  'md-lg': { min: 80, max: 120 },
  lg:      { min: 130, max: 180 },
  xl:      { min: 200, max: 270 },
};

const PARAGRAPH_LENGTH_STEPS = [
  { value: 'xs',    label: 'XS'  },
  { value: 'sm',    label: 'S'   },
  { value: 'md',    label: 'M'   },
  { value: 'md-lg', label: 'M-L' },
  { value: 'lg',    label: 'L'   },
  { value: 'xl',    label: 'XL'  },
];

const PARAGRAPH_COUNT_STEPS = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));

const CATEGORIES: Category[] = [
  'impact',
  'technical',
  'leadership',
  'collaboration',
  'other',
];

const CATEGORY_COLORS: Record<Category, string> = {
  impact:        '#06b6d4',
  technical:     '#8b5cf6',
  leadership:    '#f97316',
  collaboration: '#22c55e',
  other:         '#6b7280',
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function CategoryBadge({ category, label }: { category: Category; label: string }) {
  return (
    <Badge
      variant="subtle"
      color={CATEGORY_COLORS[category]}
      style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
    >
      {label}
    </Badge>
  );
}

// ── Bullet add/edit form ──────────────────────────────────────────────────────

interface BulletFormProps {
  category: Category;
  skills: Skill[];
  initial?: BulletPoint;
  onSave: (bullet: BulletPoint) => void;
  formRef?: React.RefObject<HTMLFormElement | null>;
  onValidityChange?: (canSubmit: boolean) => void;
}

function BulletForm({ category, skills, initial, onSave, formRef, onValidityChange }: BulletFormProps) {
  const t = useTranslations('MatrixPage');
  const locale = useLocale();
  const [text, setText] = useState(initial?.text ?? '');
  const [selectedCategory, setSelectedCategory] = useState<Category>(
    initial?.category ?? category,
  );
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>(
    initial?.skills.map((s) => s.id) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── AI Enhance ──────────────────────────────────────────────────────────────
  const { streamingText, isGenerating, generate, abort, reset: resetLlm } =
    useGroqProxy({ temperature: 0.7 });
  const [enhancePreview, setEnhancePreview] = useState('');
  const [showEnhanceOptions, setShowEnhanceOptions] = useState(false);
  const [enhanceParagraphs, setEnhanceParagraphs] = useState(1);
  const [enhanceParagraphLength, setEnhanceParagraphLength] = useState('sm');

  useEffect(() => {
    if (streamingText) setEnhancePreview(streamingText);
  }, [streamingText]);

  // Abort streaming if form unmounts mid-generation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (isGenerating) abort(); }, []);

  useEffect(() => {
    onValidityChange?.(!saving && text.trim().length > 0);
  }, [saving, text, onValidityChange]);

  const handleConfirmEnhanceOptions = async () => {
    setShowEnhanceOptions(false);
    const currentText = text.trim();
    if (!currentText) return;
    setEnhancePreview('');
    resetLlm();
    const { min, max } = PARAGRAPH_WORD_COUNTS[enhanceParagraphLength] ?? { min: 50, max: 75 };
    const isEs = locale === 'es';
    const messages = isEs
      ? [
          {
            role: 'system' as const,
            content: `Eres un coach profesional de carrera. Reescribe y amplía el siguiente logro profesional en prosa impactante para un portafolio. Escribe exactamente ${enhanceParagraphs} párrafo${enhanceParagraphs !== 1 ? 's' : ''}. Cada párrafo debe tener entre ${min} y ${max} palabras. Enfócate en logros cuantificables, verbos de acción y resultados medibles. Devuelve únicamente el texto mejorado — sin explicaciones, etiquetas ni marcas de formato.`,
          },
          { role: 'user' as const, content: currentText },
        ]
      : [
          {
            role: 'system' as const,
            content: `You are a professional career coach and resume expert. Rewrite and expand the following career achievement into polished, impactful prose for a professional portfolio. Write exactly ${enhanceParagraphs} ${enhanceParagraphs === 1 ? 'paragraph' : 'paragraphs'}. Each paragraph must be between ${min} and ${max} words. Focus on quantifiable achievements, action verbs, and measurable outcomes. Return only the improved text — no explanations, labels, or formatting marks.`,
          },
          { role: 'user' as const, content: currentText },
        ];
    await generate(messages);
  };

  const handleAcceptEnhance = () => {
    if (enhancePreview) setText(enhancePreview);
    setEnhancePreview('');
    resetLlm();
  };

  const handleDiscardEnhance = () => {
    if (isGenerating) abort();
    setEnhancePreview('');
    resetLlm();
  };

  // ── Voice input ──────────────────────────────────────────────────────────────
  const textRef = useRef(text);
  textRef.current = text;
  const handleTranscript = useCallback((transcript: string) => {
    const current = textRef.current;
    setText(current ? `${current} ${transcript}` : transcript);
  }, []);

  // ── Form submit ──────────────────────────────────────────────────────────────
  function toggleSkill(id: number) {
    setSelectedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        text: text.trim(),
        category: selectedCategory,
        skill_ids: selectedSkillIds,
      };
      const result = initial
        ? await updateBullet(initial.id, payload)
        : await createBullet(payload);
      onSave(result);
    } catch {
      setError(t('bulletSaveError'));
    } finally {
      setSaving(false);
    }
  }

  const llmBusy = isGenerating;
  const currentLengthWordRange = PARAGRAPH_WORD_COUNTS[enhanceParagraphLength] ?? { min: 50, max: 75 };

  return (
    <>
      {showEnhanceOptions && (
        <ConfirmationModal
          title={t('enhanceOptionsTitle')}
          text={t('enhanceOptionsText')}
          okCallback={handleConfirmEnhanceOptions}
          cancelCallback={() => setShowEnhanceOptions(false)}
        >
          <Box className="matrix__enhance-options">
            <Slider
              steps={PARAGRAPH_COUNT_STEPS}
              value={enhanceParagraphs}
              onChange={(v) => setEnhanceParagraphs(Number(v))}
              label={t('enhanceParagraphsLabel')}
            />
            <Slider
              steps={PARAGRAPH_LENGTH_STEPS}
              value={enhanceParagraphLength}
              onChange={(v) => setEnhanceParagraphLength(String(v))}
              label={`${t('enhanceLengthLabel')} (${currentLengthWordRange.min}-${currentLengthWordRange.max} words/para)`}
            />
          </Box>
        </ConfirmationModal>
      )}
      <form ref={formRef} onSubmit={handleSubmit} className="matrix__add-form">
        {/* Label row with voice + enhance buttons */}
        <Box className="matrix__field-label-row">
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t('textLabel')}
          </Typography>
          <Box display="flex" alignItems="center" gap={6}>
            <SpeechButton
              language={locale === 'es' ? 'es' : 'en'}
              onTranscript={handleTranscript}
              micIcon="/icons/mic.svg"
            />
            <Button
              unstyled
              type="button"
              icon="/icons/enhance.svg"
              iconSize="16px"
              iconColor={enhancePreview ? 'var(--primary, #06b6d4)' : 'var(--foreground, #171717)'}
              disabled={llmBusy || !text.trim()}
              onClick={() => setShowEnhanceOptions(true)}
              aria-label={t('enhanceLabel')}
              title={t('enhanceLabel')}
              className={[
                'matrix__enhance-btn',
                llmBusy || !text.trim() ? 'matrix__enhance-btn--busy' : '',
                enhancePreview ? 'matrix__enhance-btn--active' : '',
              ].filter(Boolean).join(' ')}
            />
          </Box>
        </Box>
        <TextInput
          multirow
          rows={4}
          value={text}
          onChange={setText}
          required
          maxLength={500}
          width="100%"
          aria-label={t('textLabel')}
        />
        {/* Enhance preview panel */}
        {enhancePreview && (
          <Box className="matrix__enhance-preview" flexDirection="column" gap={10}>
            <Typography variant="body-sm">{enhancePreview}</Typography>
            <Box display="flex" gap={8} alignItems="center" marginTop={12}>
              {isGenerating ? (
                <Button text={t('enhanceStop')} type="button" size="md" onClick={handleDiscardEnhance} />
              ) : (
                <>
                  <Button text={t('enhanceDiscard')} type="button" size="md" onClick={handleDiscardEnhance} />
                  <Button text={t('enhanceAccept')} type="button" size="md" kind="success" onClick={handleAcceptEnhance} />
                </>
              )}
            </Box>
          </Box>
        )}
        <Select
          label={t('categoryLabel')}
          value={selectedCategory}
          onChange={(v) => setSelectedCategory(v as Category)}
          options={CATEGORIES.map((cat) => ({ value: cat, label: t(`categories.${cat}`) }))}
          width="100%"
        />
        {skills.length > 0 && (
          <Box>
            <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={4}>
              {t('skillsLabel')}
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={6}>
              {skills.map((skill) => (
                <Button
                  key={skill.id}
                  type="button"
                  unstyled
                  className={`matrix__skill-checkbox${selectedSkillIds.includes(skill.id) ? ' matrix__skill-checkbox--selected' : ''}`}
                  onClick={() => toggleSkill(skill.id)}
                  aria-pressed={selectedSkillIds.includes(skill.id)}
                >
                  {skill.name}
                </Button>
              ))}
            </Box>
          </Box>
        )}
        {error && (
          <Typography variant="caption" color="var(--error, #ef4444)">
            {error}
          </Typography>
        )}
      </form>
    </>
  );
}

// ── Bullet card ───────────────────────────────────────────────────────────────

interface BulletCardProps {
  bullet: BulletPoint;
  skills: Skill[];
  onEdit: (bullet: BulletPoint) => void;
  onDelete: (id: number) => void;
  onApprove: (id: number) => void;
}

function BulletCard({ bullet, skills, onEdit, onDelete, onApprove }: BulletCardProps) {
  const t = useTranslations('MatrixPage');
  const showApprove = bullet.source === 'extracted' && !bullet.is_approved;

  return (
    <Box
      className="matrix__bullet"
      display="flex"
      flexDirection="column"
      gap={8}
      padding={8}
      borderRadius={8}
      border={showApprove ? '1px solid var(--warning, #f59e0b)' : '1px solid var(--border, #e5e7eb)'}
      backgroundColor="var(--surface-1, #fff)"
    >
      <Typography as="p" variant="body" color="var(--foreground)" styles={{ lineHeight: 1.5 }}>
        {bullet.text}
      </Typography>
      <Box display="flex" alignItems="center" flexWrap="wrap" gap={6}>
        <Badge
          size="lg"
          variant="filled"
          color="var(--muted, #f3f4f6)"
          textColor="var(--muted-foreground, #6b7280)"
          style={{ borderRadius: '4px', fontWeight: 500 }}
        >
          {bullet.source === 'manual' ? t('sourceManual') : t('sourceExtracted')}
        </Badge>
        {bullet.skills.map((skill) => (
          <Badge key={skill.id} size="lg" variant="outlined" color="var(--primary, #06b6d4)">
            {skill.name}
          </Badge>
        ))}
      </Box>
      <Box display="flex" alignItems="center" gap={6} justifyContent="flex-end" marginTop={2}>
        <Button
          text={t('delete')}
          type="button"
          size="md"
          kind="error"
          onClick={() => onDelete(bullet.id)}
        />
        <Button text={t('edit')} type="button" size="md" onClick={() => onEdit(bullet)} />
        {showApprove && (
          <Button text={t('approve')} type="button" size="md" kind="success" onClick={() => onApprove(bullet.id)} />
        )}
      </Box>
    </Box>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

interface CategorySectionProps {
  category: Category;
  bullets: BulletPoint[];
  skills: Skill[];
  onEdit: (bullet: BulletPoint) => void;
  onBulletDeleted: (id: number) => void;
  onBulletApproved: (id: number) => void;
}

function CategorySection({
  category,
  bullets,
  skills,
  onEdit,
  onBulletDeleted,
  onBulletApproved,
}: CategorySectionProps) {
  const t = useTranslations('MatrixPage');
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  return (
    <>
      {pendingDeleteId !== null && (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDeleteText')}
          okCallback={() => {
            const id = pendingDeleteId;
            setPendingDeleteId(null);
            onBulletDeleted(id);
          }}
          cancelCallback={() => setPendingDeleteId(null)}
        />
      )}
      <Box display="flex" flexDirection="column" gap={12}>
        <Box display="flex" alignItems="center" gap={8}>
          <CategoryBadge category={category} label={t(`categories.${category}`)} />
          <Typography as="span" variant="label" color="var(--muted-foreground, #6b7280)">
            {bullets.length}
          </Typography>
        </Box>

        {bullets.length === 0 ? (
          <Typography
            as="p"
            variant="body"
            color="var(--muted-foreground, #6b7280)"
            paddingTop={4}
            paddingBottom={4}
          >
            {t('emptyCategory')}
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {bullets.map((bullet) => (
              <Grid key={bullet.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <BulletCard
                  bullet={bullet}
                  skills={skills}
                  onEdit={onEdit}
                  onDelete={setPendingDeleteId}
                  onApprove={onBulletApproved}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </>
  );
}

// ── Skills panel ──────────────────────────────────────────────────────────────

interface SkillsPanelProps {
  skills: Skill[];
  onSkillAdded: (skill: Skill) => void;
  onSkillDeleted: (id: number) => void;
}

function SkillsPanel({ skills, onSkillAdded, onSkillDeleted }: SkillsPanelProps) {
  const t = useTranslations('MatrixPage');
  const [newName, setNewName] = useState('');
  const [newProficiency, setNewProficiency] = useState(3);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [toastKey, setToastKey] = useState(0);

  function showToast(text: string, kind: 'success' | 'error') {
    setToast({ text, kind });
    setToastKey((k) => k + 1);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const isDuplicate = skills.some(
      (s) => s.name.toLowerCase() === newName.trim().toLowerCase(),
    );
    if (isDuplicate) {
      showToast(t('skillDuplicateError'), 'error');
      return;
    }
    setSaving(true);
    try {
      const skill = await createSkill({ name: newName.trim(), proficiency: newProficiency });
      onSkillAdded(skill);
      setNewName('');
      setNewProficiency(3);
      setAdding(false);
    } catch (err) {
      const isDuplicate =
        err instanceof MatrixError && err.status === 400 && Array.isArray(err.data.name);
      showToast(isDuplicate ? t('skillDuplicateError') : t('skillSaveError'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteSkill(id);
      onSkillDeleted(id);
      showToast(t('skillDeleted'), 'success');
    } catch {
      showToast(t('skillDeleteError'), 'error');
    }
  }

  return (
    <>
      {pendingDeleteId !== null && (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDeleteText')}
          okCallback={() => {
            const id = pendingDeleteId;
            setPendingDeleteId(null);
            handleDelete(id);
          }}
          cancelCallback={() => setPendingDeleteId(null)}
        />
      )}
    <Box
      borderRadius={12}
      padding={12}
      backgroundColor="var(--surface-1)"
      border="1px solid var(--border, #e5e7eb)"
    >
      <Box
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
        marginBottom={8}
      >
        <Box>
          <Typography as="h2" variant="h3" fontWeight={600} marginBottom={4}>
            {t('skillsSection')}
          </Typography>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t('skillsSectionSubtitle')}
          </Typography>
        </Box>
        {!adding && (
          <Button text={t('addSkill')} type="button" size="md" onClick={() => setAdding(true)} 
          kind='success'/>
        )}
      </Box>

      {adding && (
        <form onSubmit={handleAdd} className="matrix__skill-add-form">
          <TextInput
            label={t('skillNameLabel')}
            value={newName}
            onChange={setNewName}
            required
            maxLength={100}
            width="100%"
          />
          <Box display="flex" alignItems="center" gap={8}>
            <Select
              value={String(newProficiency)}
              onChange={(v) => setNewProficiency(Number(v))}
              label={t('proficiencyLabel')}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}/5` }))}
              minWidth={110}
            />
            <Button text={t('cancel')} type="button" size="lg" onClick={() => setAdding(false)} />
            <Button
              text={saving ? t('saving') : t('save')}
              type="submit"
              size="lg"
              kind="success"
              disabled={saving || !newName.trim()}
            />
          </Box>
        </form>
      )}

      {skills.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={8} marginBottom={12}>
          {skills.map((skill) => (
            <Box
              key={skill.id}
              display="inline-flex"
              alignItems="center"
              gap={6}
              paddingY={4}
              paddingX={10}
              borderRadius={99}
              border="1px solid var(--border, #e5e7eb)"
            >
              {skill.name}
              <Typography as="span" variant="label" color="var(--primary, #06b6d4)" fontWeight={600} styles={{ fontSize: 11 }}>
                {skill.proficiency}/5
              </Typography>
              <Button
                unstyled
                type="button"
                className="matrix__skill-delete-btn"
                aria-label={t('delete')}
                onClick={() => setPendingDeleteId(skill.id)}
              >
                X
              </Button>
            </Box>
          ))}
        </Box>
      )}

      {skills.length === 0 && !adding && (
        <Typography variant="body" color="var(--muted-foreground, #6b7280)" marginBottom={8}>
          {t('noSkills')}
        </Typography>
      )}

      {toast && <Toast key={toastKey} message={toast.text} variant={toast.kind} position='top-center' />}
    </Box>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function MatrixBoard() {
  const t = useTranslations('MatrixPage');
  const [bullets, setBullets] = useState<BulletPoint[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingBullet, setEditingBullet] = useState<BulletPoint | null>(null);
  const bulletFormRef = useRef<HTMLFormElement>(null);
  const [bulletFormCanSubmit, setBulletFormCanSubmit] = useState(false);

  function openAdd() {
    setEditingBullet(null);
    setFormOpen(true);
  }

  function openEdit(bullet: BulletPoint) {
    setEditingBullet(bullet);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingBullet(null);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bulletRes, skillRes] = await Promise.all([getBullets(), getSkills()]);
      setBullets(bulletRes.results);
      setSkills(skillRes.results);
    } catch {
      setError(t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  function handleBulletSaved(bullet: BulletPoint) {
    setBullets((prev) =>
      editingBullet === null
        ? [...prev, bullet]
        : prev.map((b) => (b.id === bullet.id ? bullet : b)),
    );
    closeForm();
  }

  async function handleBulletDeleted(id: number) {
    try {
      await deleteBullet(id);
      setBullets((prev) => prev.filter((b) => b.id !== id));
    } catch {
      // error is surfaced by the category section's confirmation modal callback
    }
  }

  async function handleBulletApproved(id: number) {
    try {
      const updated = await updateBullet(id, { is_approved: true });
      setBullets((prev) => prev.map((b) => (b.id === id ? updated : b)));
    } catch {
      setError(t('approveError'));
    }
  }

  if (loading) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{ minHeight: '100vh', flexDirection: 'column', justifyContent: 'center' }}
      >
        <ProgressBar label={t('loading')} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{ minHeight: '100vh', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}
      >
        <Typography variant="body-sm" color="var(--error, #ef4444)">
          {error}
        </Typography>
        <Button text="Retry" type="button" size="md" onClick={load} />
      </Container>
    );
  }

  const bulletsByCategory = CATEGORIES.reduce<Record<Category, BulletPoint[]>>(
    (acc, cat) => {
      acc[cat] = bullets.filter((b) => b.category === cat);
      return acc;
    },
    {} as Record<Category, BulletPoint[]>,
  );

  return (
    <Container
      paddingX={10}
      styles={{ paddingTop: 'var(--ui-navbar-height)', paddingBottom: '60px' }}
    >
      <Box
        width="100%"
        marginTop={24}
        marginBottom={24}
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={16}
        flexWrap="wrap"
      >
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
            {t('title')}
          </Typography>
          <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
            {t('subtitle')}
          </Typography>
        </Box>
        <Button text={t('addBullet')} type="button" size="md" onClick={openAdd} kind='success'/>
      </Box>

      {formOpen && (
        <ConfirmationModal
          title={editingBullet ? t('editBulletTitle') : t('addBulletTitle')}
          text=""
          okCallback={() => bulletFormRef.current?.requestSubmit()}
          cancelCallback={closeForm}
          okDisabled={!bulletFormCanSubmit}
          panelMaxWidth="600px"
        >
          <BulletForm
            category={editingBullet?.category ?? 'impact'}
            skills={skills}
            initial={editingBullet ?? undefined}
            onSave={handleBulletSaved}
            formRef={bulletFormRef}
            onValidityChange={setBulletFormCanSubmit}
          />
        </ConfirmationModal>
      )}

      <Box display="flex" flexDirection="column" gap={32} marginBottom={40}>
        {CATEGORIES.map((cat) => (
          <CategorySection
            key={cat}
            category={cat}
            bullets={bulletsByCategory[cat]}
            skills={skills}
            onEdit={openEdit}
            onBulletDeleted={handleBulletDeleted}
            onBulletApproved={handleBulletApproved}
          />
        ))}
      </Box>

      <SkillsPanel
        skills={skills}
        onSkillAdded={(skill) => setSkills((prev) => [...prev, skill])}
        onSkillDeleted={(id) => setSkills((prev) => prev.filter((s) => s.id !== id))}
      />
    </Container>
  );
}
