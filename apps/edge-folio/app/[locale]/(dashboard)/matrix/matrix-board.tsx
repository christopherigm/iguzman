'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Badge } from '@repo/ui/core-elements/badge';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Toast } from '@repo/ui/core-elements/toast';
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
  onCancel: () => void;
}

function BulletForm({ category, skills, initial, onSave, onCancel }: BulletFormProps) {
  const t = useTranslations('MatrixPage');
  const [text, setText] = useState(initial?.text ?? '');
  const [selectedCategory, setSelectedCategory] = useState<Category>(
    initial?.category ?? category,
  );
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>(
    initial?.skills.map((s) => s.id) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <form onSubmit={handleSubmit} className="matrix__add-form">
      <TextInput
        multirow
        rows={4}
        label={t('textLabel')}
        value={text}
        onChange={setText}
        required
        maxLength={500}
        width="100%"
      />
      <select
        className="matrix__select"
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value as Category)}
        aria-label={t('categoryLabel')}
      >
        {CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {t(`categories.${cat}`)}
          </option>
        ))}
      </select>
      {skills.length > 0 && (
        <Box>
          <Typography variant="caption" color="var(--muted-foreground, #6b7280)" marginBottom={4}>
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
      <Box display="flex" gap={8} justifyContent="flex-end">
        <Button text={t('cancel')} type="button" size="sm" onClick={onCancel} />
        <Button
          text={saving ? t('saving') : t('save')}
          type="submit"
          size="sm"
          kind="success"
          disabled={saving || !text.trim()}
        />
      </Box>
    </form>
  );
}

// ── Bullet card ───────────────────────────────────────────────────────────────

interface BulletCardProps {
  bullet: BulletPoint;
  skills: Skill[];
  onEdit: (bullet: BulletPoint) => void;
  onDelete: (id: number) => void;
}

function BulletCard({ bullet, skills, onEdit, onDelete }: BulletCardProps) {
  const t = useTranslations('MatrixPage');

  return (
    <Box
      className="matrix__bullet"
      display="flex"
      flexDirection="column"
      gap={8}
      padding={8}
      borderRadius={8}
      border="1px solid var(--border, #e5e7eb)"
      backgroundColor="var(--surface-1, #fff)"
    >
      <Typography as="p" variant="body-sm" color="var(--foreground)" styles={{ fontSize: 13, lineHeight: 1.5 }}>
        {bullet.text}
      </Typography>
      <Box display="flex" alignItems="center" flexWrap="wrap" gap={6}>
        <Badge
          size="sm"
          variant="filled"
          color="var(--muted, #f3f4f6)"
          textColor="var(--muted-foreground, #6b7280)"
          style={{ borderRadius: '4px', fontWeight: 500 }}
        >
          {bullet.source === 'manual' ? t('sourceManual') : t('sourceExtracted')}
        </Badge>
        {bullet.skills.map((skill) => (
          <Badge key={skill.id} size="sm" variant="outlined" color="var(--primary, #06b6d4)">
            {skill.name}
          </Badge>
        ))}
      </Box>
      <Box display="flex" alignItems="center" gap={6} justifyContent="flex-end" marginTop={2}>
        <Button text={t('edit')} type="button" size="sm" onClick={() => onEdit(bullet)} />
        <Button
          text={t('delete')}
          type="button"
          size="sm"
          kind="error"
          onClick={() => onDelete(bullet.id)}
        />
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
}

function CategorySection({
  category,
  bullets,
  skills,
  onEdit,
  onBulletDeleted,
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
      <Box
        display="flex"
        flexDirection="column"
        gap={12}
        borderRadius={12}
        padding={12}
        backgroundColor="var(--surface-1)"
        border="1px solid var(--border, #e5e7eb)"
      >
        <Box display="flex" alignItems="center" gap={8}>
          <CategoryBadge category={category} label={t(`categories.${category}`)} />
          <Typography as="span" variant="caption" color="var(--muted-foreground, #6b7280)" styles={{ fontSize: 12 }}>
            {bullets.length}
          </Typography>
        </Box>

        {bullets.map((bullet) => (
          <BulletCard
            key={bullet.id}
            bullet={bullet}
            skills={skills}
            onEdit={onEdit}
            onDelete={setPendingDeleteId}
          />
        ))}

        {bullets.length === 0 && (
          <Typography
            as="p"
            variant="caption"
            color="var(--muted-foreground, #6b7280)"
            textAlign="center"
            paddingTop={16}
            paddingBottom={8}
          >
            {t('emptyCategory')}
          </Typography>
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
        marginBottom={16}
      >
        <Box>
          <Typography as="h2" variant="h3" fontWeight={600} marginBottom={4}>
            {t('skillsSection')}
          </Typography>
          <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
            {t('skillsSectionSubtitle')}
          </Typography>
        </Box>
        {!adding && (
          <Button text={t('addSkill')} type="button" size="sm" onClick={() => setAdding(true)} />
        )}
      </Box>

      {skills.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={8} marginBottom={12}>
          {skills.map((skill) => (
            <span key={skill.id} className="matrix__skill-item">
              {skill.name}
              <Typography as="span" variant="caption" color="var(--primary, #06b6d4)" fontWeight={600} styles={{ fontSize: 11 }}>
                {skill.proficiency}/5
              </Typography>
              <Button
                unstyled
                type="button"
                className="matrix__skill-delete-btn"
                aria-label={t('delete')}
                onClick={() => setPendingDeleteId(skill.id)}
              >
                ×
              </Button>
            </span>
          ))}
        </Box>
      )}

      {skills.length === 0 && !adding && (
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)" marginBottom={8}>
          {t('noSkills')}
        </Typography>
      )}

      {adding && (
        <form onSubmit={handleAdd} className="matrix__skill-add-form">
          <TextInput
            label={t('skillNameLabel')}
            value={newName}
            onChange={setNewName}
            required
            maxLength={100}
            flex={1}
            minWidth={140}
          />
          <select
            className="matrix__select"
            value={newProficiency}
            onChange={(e) => setNewProficiency(Number(e.target.value))}
            aria-label={t('proficiencyLabel')}
            style={{ width: 'auto' }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}/5
              </option>
            ))}
          </select>
          <Button text={t('cancel')} type="button" size="sm" onClick={() => setAdding(false)} />
          <Button
            text={saving ? t('saving') : t('save')}
            type="submit"
            size="sm"
            kind="success"
            disabled={saving || !newName.trim()}
          />
        </form>
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
        <Button text="Retry" type="button" size="sm" onClick={load} />
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
        {!formOpen && (
          <Button text={t('addBullet')} type="button" size="sm" onClick={openAdd} />
        )}
      </Box>

      {formOpen && (
        <Box marginBottom={24}>
          <BulletForm
            category={editingBullet?.category ?? 'impact'}
            skills={skills}
            initial={editingBullet ?? undefined}
            onSave={handleBulletSaved}
            onCancel={closeForm}
          />
        </Box>
      )}

      <Box
        display="grid"
        gap={20}
        marginBottom={40}
        styles={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
      >
        {CATEGORIES.map((cat) => (
          <CategorySection
            key={cat}
            category={cat}
            bullets={bulletsByCategory[cat]}
            skills={skills}
            onEdit={openEdit}
            onBulletDeleted={handleBulletDeleted}
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
