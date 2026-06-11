import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer';
import type { TailoredBullet } from './applications';
import type { WorkExperience, Education, Language, Project } from './career';
import type { Skill } from './matrix';

const CATEGORY_LABELS: Record<string, string> = {
  impact: 'Impact',
  technical: 'Technical',
  leadership: 'Leadership',
  collaboration: 'Collaboration',
  other: 'Other',
};

const DEGREE_LABELS: Record<string, string> = {
  bachelor: "Bachelor's",
  master: "Master's",
  phd: 'PhD / Doctorate',
  associate: 'Associate',
  certificate: 'Certificate',
  bootcamp: 'Bootcamp',
  other: 'Other',
};

const PROFICIENCY_LABELS: Record<string, string> = {
  native: 'Native',
  fluent: 'Fluent',
  professional: 'Professional proficiency',
  basic: 'Basic',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#111827',
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 52,
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 12,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  photoContainer: {
    width: 72,
    height: 72,
    borderRadius: 4,
    overflow: 'hidden',
    flexShrink: 0,
    marginTop: 4,
  },
  photoImage: {
    width: 72,
    height: 72,
  },
  photoSpacer: {
    width: 72,
    flexShrink: 0,
  },
  headerTextArea: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  jobTitle: {
    fontSize: 11,
    color: '#374151',
    marginBottom: 6,
    textAlign: 'center',
  },
  headerRow: {
    fontSize: 9,
    color: '#6b7280',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  metaSep: {
    color: '#d1d5db',
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 3,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  entryTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },
  entryMeta: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 10,
    color: '#111827',
    lineHeight: 1.5,
    marginBottom: 4,
    textAlign: 'justify',
  },
  categoryTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginTop: 8,
    marginBottom: 4,
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 14,
    fontSize: 10,
    color: '#06b6d4',
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    color: '#111827',
    lineHeight: 1.5,
    textAlign: 'justify',
  },
  skillsLine: {
    fontSize: 10,
    color: '#111827',
    lineHeight: 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 52,
    right: 52,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

const naftaStyles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#111827',
    paddingTop: 52,
    paddingBottom: 52,
    paddingHorizontal: 60,
    lineHeight: 1.6,
  },
  companyHeader: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 12,
  },
  companyName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    marginBottom: 2,
  },
  companyMeta: {
    fontSize: 9,
    color: '#6b7280',
  },
  paragraph: {
    fontSize: 10,
    color: '#111827',
    lineHeight: 1.6,
    marginBottom: 10,
    textAlign: 'justify',
  },
  sectionHeading: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    marginBottom: 4,
    marginTop: 8,
    textAlign: 'center',
    textDecoration: 'underline',
  },
  headerLine: {
    fontSize: 10,
    color: '#111827',
    lineHeight: 1.4,
    marginBottom: 2,
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 10,
  },
  bulletDot: {
    width: 14,
    fontSize: 10,
    color: '#111827',
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    color: '#111827',
    lineHeight: 1.6,
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 60,
    right: 60,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

const NAFTA_SECTION_HEADINGS = [
  'About the Company',
  'Offered Position:',
  'Qualifications',
  'Employment Terms',
];

// Strip markdown bold markers that the LLM may emit despite instructions.
function stripBold(line: string): string {
  return line.replace(/\*\*(.+?)\*\*/g, '$1');
}

function isHeading(line: string): boolean {
  return NAFTA_SECTION_HEADINGS.some((h) => line.startsWith(h));
}

export interface NaftaLetterPDFProps {
  companyName: string;
  letterText: string;
}

export function NaftaLetterDocument({ companyName, letterText }: NaftaLetterPDFProps) {
  const lines = letterText.split('\n');

  // Tight spacing for the address block / RE line before the salutation
  const salutationIdx = lines.findIndex((l) =>
    l.trim().toLowerCase().startsWith('dear sir'),
  );

  return (
    <Document>
      <Page size="LETTER" style={naftaStyles.page}>
        <View style={naftaStyles.companyHeader}>
          <Text style={naftaStyles.companyName}>{companyName}</Text>
          <Text style={naftaStyles.companyMeta}>TN NAFTA Visa Support Letter</Text>
        </View>

        {lines.map((line, i) => {
          const trimmed = stripBold(line.trim());
          const inHeader = salutationIdx === -1 || i < salutationIdx;

          if (!trimmed) {
            return <View key={i} style={{ marginBottom: inHeader ? 2 : 8 }} />;
          }
          if (trimmed.startsWith('•')) {
            return (
              <View key={i} style={naftaStyles.bullet}>
                <Text style={naftaStyles.bulletDot}>•</Text>
                <Text style={naftaStyles.bulletText}>{trimmed.slice(1).trim()}</Text>
              </View>
            );
          }
          if (isHeading(trimmed)) {
            return <Text key={i} style={naftaStyles.sectionHeading}>{trimmed}</Text>;
          }
          return (
            <Text key={i} style={inHeader ? naftaStyles.headerLine : naftaStyles.paragraph}>
              {trimmed}
            </Text>
          );
        })}

        <Text style={naftaStyles.footer} fixed>
          Generated by EdgeFolio · TN NAFTA Visa Support Letter
        </Text>
      </Page>
    </Document>
  );
}

export interface ResumePDFProps {
  // Header
  fullName: string;
  jobTitle: string;
  email: string;
  phone?: string;
  location?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  // Profile photo (base64 data URI or absolute URL)
  photoUrl?: string;
  // Summary
  summary?: string;
  // Skills (flat list, sorted by proficiency desc)
  skills?: Pick<Skill, 'name' | 'proficiency'>[];
  // Experience
  workExperiences?: WorkExperience[];
  targetRole: string;
  targetCompany: string;
  tailoredBullets: TailoredBullet[];
  // Projects
  projects?: Project[];
  // Education
  educations?: Education[];
  // Languages
  languages?: Language[];
}

function groupByCategory(bullets: TailoredBullet[]): Map<string, TailoredBullet[]> {
  const map = new Map<string, TailoredBullet[]>();
  for (const b of bullets) {
    const cat = b.category || 'other';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(b);
  }
  return map;
}

function formatDateRange(startDate: string, endDate: string | null, isCurrent: boolean): string {
  const fmt = (d: string) => {
    const [year, month] = d.split('-');
    return `${month}/${year}`;
  };
  const start = fmt(startDate);
  const end = isCurrent ? 'Present' : endDate ? fmt(endDate) : '';
  return end ? `${start} - ${end}` : start;
}

export function ResumeDocument({
  fullName,
  jobTitle,
  email,
  phone,
  location,
  githubUrl,
  linkedinUrl,
  photoUrl,
  summary,
  skills,
  workExperiences,
  tailoredBullets,
  projects,
  educations,
  languages,
}: ResumePDFProps) {
  // Bullets whose source bullet has a work_experience link render inside that WE entry
  const bulletsByWE = new Map<number, TailoredBullet[]>();
  const orphanBullets: TailoredBullet[] = [];
  for (const b of tailoredBullets) {
    if (b.work_experience_id) {
      if (!bulletsByWE.has(b.work_experience_id)) bulletsByWE.set(b.work_experience_id, []);
      bulletsByWE.get(b.work_experience_id)!.push(b);
    } else {
      orphanBullets.push(b);
    }
  }
  const orphanGrouped = groupByCategory(orphanBullets);
  const orphanCategories = Array.from(orphanGrouped.keys());

  const contactParts: string[] = [];
  if (email) contactParts.push(email);
  if (phone) contactParts.push(phone);
  if (location) contactParts.push(location);
  if (githubUrl) contactParts.push(githubUrl);
  if (linkedinUrl) contactParts.push(linkedinUrl);

  const sortedSkills = skills
    ? [...skills].sort((a, b) => b.proficiency - a.proficiency)
    : [];

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={photoUrl ? styles.headerInner : undefined}>
            {photoUrl ? (
              <View style={styles.photoContainer}>
                <Image src={photoUrl} style={styles.photoImage} />
              </View>
            ) : null}
            <View style={photoUrl ? styles.headerTextArea : undefined}>
              <Text style={styles.name}>{fullName}</Text>
              {jobTitle ? <Text style={styles.jobTitle}>{jobTitle}</Text> : null}
              <View style={styles.headerRow}>
                {contactParts.map((part, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                    {i > 0 ? <Text style={styles.metaSep}>·</Text> : null}
                    <Text>{part}</Text>
                  </View>
                ))}
              </View>
            </View>
            {photoUrl ? <View style={styles.photoSpacer} /> : null}
          </View>
        </View>

        {/* ── Professional Summary ── */}
        {summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional Summary</Text>
            <Text style={styles.paragraph}>{summary}</Text>
          </View>
        ) : null}

        {/* ── Key Achievements (bullets not linked to a specific WE) ── */}
        {orphanBullets.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Achievements</Text>
            {orphanCategories.map((cat) => (
              <View key={cat}>
                <Text style={styles.categoryTitle}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </Text>
                {orphanGrouped.get(cat)!.map((b) => (
                  <View key={b.id} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{b.tailored_text}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Technical Skills ── */}
        {sortedSkills.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Technical Skills</Text>
            <Text style={styles.skillsLine}>
              {sortedSkills.map((s) => s.name).join(', ')}
            </Text>
          </View>
        ) : null}

        {/* ── Professional Experience (tailored bullets embedded per role) ── */}
        {(workExperiences ?? []).length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional Experience</Text>
            {(workExperiences ?? []).map((exp) => {
              const expBullets = bulletsByWE.get(exp.id) ?? [];
              return (
                <View key={exp.id} style={{ marginBottom: 10 }}>
                  <View style={styles.entryHeader}>
                    <Text style={styles.entryTitle}>{exp.title} — {exp.company}</Text>
                  </View>
                  <Text style={styles.entryMeta}>
                    {formatDateRange(exp.start_date, exp.end_date, exp.is_current)}
                    {exp.location ? `  ·  ${exp.location}` : ''}
                  </Text>
                  {expBullets.length > 0
                    ? expBullets.map((b) => (
                        <View key={b.id} style={styles.bullet}>
                          <Text style={styles.bulletDot}>•</Text>
                          <Text style={styles.bulletText}>{b.tailored_text}</Text>
                        </View>
                      ))
                    : exp.description
                      ? <Text style={styles.paragraph}>{exp.description}</Text>
                      : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* ── Personal Projects ── */}
        {(projects ?? []).length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Projects</Text>
            {(projects ?? []).map((proj) => (
              <View key={proj.id} style={{ marginBottom: 8 }}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>{proj.name}</Text>
                  {proj.url ? <Text style={styles.entryMeta}>{proj.url}</Text> : null}
                </View>
                {proj.tech_stack && proj.tech_stack.length > 0 ? (
                  <Text style={styles.entryMeta}>
                    {proj.tech_stack.map((ts) => ts.name).join(', ')}
                  </Text>
                ) : null}
                {proj.description
                  ? proj.description.split('\n').filter(Boolean).map((line, i) => (
                    <View key={i} style={styles.bullet}>
                      <Text style={styles.bulletDot}>•</Text>
                      <Text style={styles.bulletText}>{line}</Text>
                    </View>
                  ))
                  : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Education ── */}
        {(educations ?? []).length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {(educations ?? []).map((edu) => (
              <View key={edu.id} style={{ marginBottom: 6 }}>
                <Text style={styles.entryTitle}>
                  {DEGREE_LABELS[edu.degree] ?? edu.degree}
                  {edu.field_of_study ? ` in ${edu.field_of_study}` : ''}
                </Text>
                <Text style={styles.entryMeta}>
                  {edu.institution}
                  {'  ·  '}
                  {edu.start_year}
                  {' - '}
                  {edu.is_current ? 'Present' : (edu.end_year ?? '')}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Languages ── */}
        {(languages ?? []).length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Languages</Text>
            {(languages ?? []).map((lang) => (
              <View key={lang.id} style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  {lang.name} ({PROFICIENCY_LABELS[lang.proficiency] ?? lang.proficiency})
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          Generated by EdgeFolio
        </Text>
      </Page>
    </Document>
  );
}
