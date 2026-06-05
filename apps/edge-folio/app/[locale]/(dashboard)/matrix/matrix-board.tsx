'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import {
  getSkills,
  createSkill,
  deleteSkill,
  getBullets,
  createBullet,
  updateBullet,
  deleteBullet,
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

// ── Small helpers ─────────────────────────────────────────────────────────────

function CategoryBadge({ category, label }: { category: Category; label: string }) {
  return (
    <span className={`matrix__category-badge matrix__category-badge--${category}`}>
      {label}
    </span>
  );
}

function StatusMsg({ text, kind }: { text: string; kind: 'success' | 'error' }) {
  return (
    <span className={kind === 'success' ? 'matrix__success' : 'matrix__error'}>
      {text}
    </span>
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
      <textarea
        className="matrix__textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('textPlaceholder')}
        aria-label={t('textLabel')}
        required
        maxLength={500}
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
          <Box className="matrix__skill-checkboxes">
            {skills.map((skill) => (
              <button
                key={skill.id}
                type="button"
                className={`matrix__skill-checkbox${selectedSkillIds.includes(skill.id) ? ' matrix__skill-checkbox--selected' : ''}`}
                onClick={() => toggleSkill(skill.id)}
                aria-pressed={selectedSkillIds.includes(skill.id)}
              >
                {skill.name}
              </button>
            ))}
          </Box>
        </Box>
      )}
      {error && <StatusMsg text={error} kind="error" />}
      <Box className="matrix__form-actions">
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
    <Box className="matrix__bullet">
      <p className="matrix__bullet-text">{bullet.text}</p>
      <Box className="matrix__bullet-meta">
        <span className="matrix__source-badge">
          {bullet.source === 'manual' ? t('sourceManual') : t('sourceExtracted')}
        </span>
        {bullet.skills.map((skill) => (
          <span key={skill.id} className="matrix__skill-tag">
            {skill.name}
          </span>
        ))}
      </Box>
      <Box className="matrix__bullet-actions">
        <Button
          text={t('edit')}
          type="button"
          size="sm"
          onClick={() => onEdit(bullet)}
        />
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
  onBulletSaved: (bullet: BulletPoint, isNew: boolean) => void;
  onBulletDeleted: (id: number) => void;
}

function CategorySection({
  category,
  bullets,
  skills,
  onBulletSaved,
  onBulletDeleted,
}: CategorySectionProps) {
  const t = useTranslations('MatrixPage');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BulletPoint | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  function handleSaved(bullet: BulletPoint) {
    const isNew = !editing;
    setAdding(false);
    setEditing(null);
    onBulletSaved(bullet, isNew);
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
            onBulletDeleted(id);
          }}
          cancelCallback={() => setPendingDeleteId(null)}
        />
      )}
      <Box className="matrix__section">
        <Box className="matrix__section-header">
          <Box className="matrix__section-title-row">
            <CategoryBadge category={category} label={t(`categories.${category}`)} />
            <span className="matrix__section-count">{bullets.length}</span>
          </Box>
          {!adding && !editing && (
            <Button
              text={t('addBullet')}
              type="button"
              size="sm"
              onClick={() => setAdding(true)}
            />
          )}
        </Box>

        {bullets.map((bullet) =>
          editing?.id === bullet.id ? (
            <BulletForm
              key={bullet.id}
              category={category}
              skills={skills}
              initial={bullet}
              onSave={handleSaved}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <BulletCard
              key={bullet.id}
              bullet={bullet}
              skills={skills}
              onEdit={setEditing}
              onDelete={setPendingDeleteId}
            />
          ),
        )}

        {bullets.length === 0 && !adding && (
          <p className="matrix__empty">{t('emptyCategory')}</p>
        )}

        {adding && (
          <BulletForm
            category={category}
            skills={skills}
            onSave={handleSaved}
            onCancel={() => setAdding(false)}
          />
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
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const skill = await createSkill({ name: newName.trim(), proficiency: newProficiency });
      onSkillAdded(skill);
      setNewName('');
      setNewProficiency(3);
      setAdding(false);
    } catch {
      setToast({ text: t('skillDeleteError'), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteSkill(id);
      onSkillDeleted(id);
      setToast({ text: t('skillDeleted'), kind: 'success' });
    } catch {
      setToast({ text: t('skillDeleteError'), kind: 'error' });
    }
  }

  return (
    <Box className="matrix__skills-panel">
      <Box className="matrix__skills-panel-header">
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
        <Box className="matrix__skill-list">
          {skills.map((skill) => (
            <span key={skill.id} className="matrix__skill-item">
              {skill.name}
              <span className="matrix__skill-proficiency">{skill.proficiency}/5</span>
              <button
                type="button"
                className="matrix__skill-delete-btn"
                aria-label={t('delete')}
                onClick={() => handleDelete(skill.id)}
              >
                ×
              </button>
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
          <input
            className="matrix__skill-add-input"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('skillNameLabel')}
            aria-label={t('skillNameLabel')}
            required
            maxLength={100}
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

      {toast && <StatusMsg text={toast.text} kind={toast.kind} />}
    </Box>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function MatrixBoard() {
  const t = useTranslations('MatrixPage');
  const [bullets, setBullets] = useState<BulletPoint[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  function handleBulletSaved(bullet: BulletPoint, isNew: boolean) {
    setBullets((prev) =>
      isNew ? [...prev, bullet] : prev.map((b) => (b.id === bullet.id ? bullet : b)),
    );
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
      <Box width="100%" marginTop={24} marginBottom={32} className="matrix__header">
        <Box className="matrix__header-text">
          <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
            {t('title')}
          </Typography>
          <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
            {t('subtitle')}
          </Typography>
        </Box>
      </Box>

      <Box className="matrix__grid">
        {CATEGORIES.map((cat) => (
          <CategorySection
            key={cat}
            category={cat}
            bullets={bulletsByCategory[cat]}
            skills={skills}
            onBulletSaved={handleBulletSaved}
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
