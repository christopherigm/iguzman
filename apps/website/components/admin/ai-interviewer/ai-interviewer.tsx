'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import './ai-interviewer.css';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { Icon } from '@repo/ui/core-elements/icon';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Switch } from '@repo/ui/core-elements/switch';
import { Spinner } from '@repo/ui/core-elements/spinner';
import { SpeechButton } from '@repo/ui/core-elements/speech-button';
import { getAccessToken } from '@/lib/auth';
import { useGroqProxy, type LlmMessage } from '@repo/ui/use-groq';
import type { FieldDef } from '../admin-form';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AiEntityType = 'product' | 'service' | 'system';

type InterviewStage = 'idle' | 'scoping' | 'researching' | 'proposal' | 'negotiating' | 'confirmed';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  variant?: 'research' | 'warning' | 'proposal';
}

interface BrandPersona {
  site_name?: string;
  mission?: string;
  en_mission?: string;
  vision?: string;
  en_vision?: string;
  slogan?: string;
  about?: string;
  en_about?: string;
}

interface ProposedRecord {
  name?: string;
  en_name?: string;
  description?: string;
  en_description?: string;
  short_description?: string;
  en_short_description?: string;
  price?: number | string;
  compare_price?: number | string | null;
  sku?: string | null;
  duration?: number | null;
  modality?: string | null;
  about?: string;
  en_about?: string;
  mission?: string;
  en_mission?: string;
  vision?: string;
  en_vision?: string;
  slogan?: string;
  justification?: string;
  brand_alignment_notes?: string | null;
  [key: string]: unknown;
}

export interface AiInterviewerProps {
  entityType: AiEntityType;
  entityLabel: string;
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AI_TARGET_FIELDS: Record<AiEntityType, string[]> = {
  product: [
    'name', 'en_name',
    'description', 'en_description',
    'short_description', 'en_short_description',
    'price', 'compare_price', 'sku',
  ],
  service: [
    'name', 'en_name',
    'description', 'en_description',
    'short_description', 'en_short_description',
    'price', 'duration', 'modality', 'sku',
  ],
  system: [
    'about', 'en_about',
    'mission', 'en_mission',
    'vision', 'en_vision',
    'slogan',
  ],
};

const PROPOSAL_FIELD_LABELS: Record<string, string> = {
  name: 'Name (ES)',
  en_name: 'Name (EN)',
  description: 'Description (ES)',
  en_description: 'Description (EN)',
  short_description: 'Short Description (ES)',
  en_short_description: 'Short Description (EN)',
  price: 'Price',
  compare_price: 'Compare Price',
  sku: 'SKU',
  duration: 'Duration (min)',
  modality: 'Modality',
  about: 'About (ES)',
  en_about: 'About (EN)',
  mission: 'Mission (ES)',
  en_mission: 'Mission (EN)',
  vision: 'Vision (ES)',
  en_vision: 'Vision (EN)',
  slogan: 'Slogan',
};

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MIN_SCOPING_ROUNDS = 3;
const VISIBLE_STAGES: InterviewStage[] = ['scoping', 'researching', 'proposal', 'confirmed'];

const LOCALE_LANGUAGE_MAP: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
};

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildScopingSystemPrompt(
  persona: BrandPersona | null,
  entityType: AiEntityType,
  imageAnalysis: string,
  researchData: string,
  language: string,
): string {
  const brandBlock = persona
    ? `Brand DNA:
- Company: ${persona.site_name ?? ''}
- Mission: ${persona.mission || persona.en_mission || ''}
- Vision: ${persona.vision || persona.en_vision || ''}
- Slogan: ${persona.slogan ?? ''}`
    : 'Brand context: not available.';

  const extras: string[] = [];
  if (imageAnalysis) extras.push(`Visual context from uploaded image:\n${imageAnalysis}`);
  if (researchData) extras.push(`Market research data:\n${researchData}`);

  return `You are an AI Marketing Strategist conducting a business interview.

${brandBlock}${extras.length ? `\n\n${extras.join('\n\n')}` : ''}

Your task: Gather information to create a ${entityType} record.
Fields to populate: ${AI_TARGET_FIELDS[entityType].join(', ')}

LANGUAGE: Conduct the entire interview in ${language}. All your questions and responses must be in ${language}.

RULES:
- Ask exactly one focused question at a time
- Keep questions brief and business-relevant
- Reference the brand context naturally when relevant
- After ${MIN_SCOPING_ROUNDS} questions have been answered, tell the user you have what you need
- Do NOT ask the user for translations into any other language — the proposal phase will auto-translate all fields
- Do NOT generate the proposal in this phase — just gather information`;
}

function buildProposalMessages(
  persona: BrandPersona | null,
  entityType: AiEntityType,
  conversationText: string,
  imageAnalysis: string,
  researchData: string,
  language: string,
): LlmMessage[] {
  const brandBlock = persona
    ? `Brand: ${persona.site_name ?? ''}. Mission: ${persona.mission || persona.en_mission || ''}. Vision: ${persona.vision || persona.en_vision || ''}.`
    : '';

  const serviceSchema =
    entityType === 'service'
      ? `  "duration": <number in minutes or null>,\n  "modality": "online" | "in_person" | "hybrid",\n  `
      : '';

  const productSchema =
    entityType === 'product'
      ? `  "sku": "<string or null>",\n  "compare_price": <number or null>,\n  `
      : '';

  const systemSchema =
    entityType === 'system'
      ? `  "about": "<Spanish about section — translate from interview if needed>",\n  "en_about": "<English about section — translate from interview if needed>",\n  "mission": "<Spanish mission — translate from interview if needed>",\n  "en_mission": "<English mission — translate from interview if needed>",\n  "vision": "<Spanish vision — translate from interview if needed>",\n  "en_vision": "<English vision — translate from interview if needed>",\n  "slogan": "<slogan>",\n  `
      : '';

  const contextLines: string[] = [];
  if (imageAnalysis) contextLines.push(`Visual context: ${imageAnalysis}`);
  if (researchData) contextLines.push(`Market research: ${researchData}`);
  const contextBlock = contextLines.join('\n');

  const systemContent = `You are a professional copywriter and business strategist.
${brandBlock}

The interview was conducted in ${language}. Based on the interview conversation${contextBlock ? ' and additional context' : ''}, generate a complete ${entityType} record.
${contextBlock}

TRANSLATION RULE: All bilingual fields have a Spanish version (base field, e.g. "name") and an English version ("en_" prefix, e.g. "en_name"). Use the interview content for the ${language} version and TRANSLATE it for the other language. Never ask for translations — produce both versions yourself.

Respond ONLY with a valid JSON object. No markdown, no explanation outside the JSON. Use this exact structure:
{
  "name": "<Spanish name — translate from interview if needed>",
  "en_name": "<English name — translate from interview if needed>",
  "description": "<Spanish description, 2-3 sentences — translate from interview if needed>",
  "en_description": "<English description, 2-3 sentences — translate from interview if needed>",
  "short_description": "<Spanish one-sentence summary — translate from interview if needed>",
  "en_short_description": "<English one-sentence summary — translate from interview if needed>",
  "price": <number>,
  ${productSchema}${serviceSchema}${systemSchema}"justification": "<1-2 sentences explaining pricing and positioning>",
  "brand_alignment_notes": "<brand alignment concerns if any, or null>"
}`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: conversationText },
    { role: 'user', content: 'Generate the structured record now.' },
  ];
}

// ── AiInterviewer ─────────────────────────────────────────────────────────────

export function AiInterviewer({
  entityType,
  entityLabel,
  fields,
  values,
  onChange,
}: AiInterviewerProps) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const language = LOCALE_LANGUAGE_MAP[locale] ?? 'English';

  // ── Modal / stage state ──────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [stage, setStage] = useState<InterviewStage>('idle');
  const stageRef = useRef<InterviewStage>('idle');
  useEffect(() => { stageRef.current = stage; }, [stage]);

  // ── Brand persona ────────────────────────────────────────────────────────────
  const [brandPersona, setBrandPersona] = useState<BrandPersona | null>(null);
  const [loadingPersona, setLoadingPersona] = useState(false);
  const [personaError, setPersonaError] = useState(false);
  const brandPersonaRef = useRef<BrandPersona | null>(null);
  useEffect(() => { brandPersonaRef.current = brandPersona; }, [brandPersona]);

  // ── Chat display ─────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── User input ───────────────────────────────────────────────────────────────
  const [userInput, setUserInput] = useState('');

  // ── LLM conversation history (sent to Groq on each turn) ────────────────────
  const llmHistoryRef = useRef<LlmMessage[]>([]);
  const systemPromptRef = useRef('');

  // ── Image analysis ───────────────────────────────────────────────────────────
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState('');
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const imageAnalysisRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { imageAnalysisRef.current = imageAnalysis; }, [imageAnalysis]);

  // ── Market research ──────────────────────────────────────────────────────────
  const [marketResearchEnabled, setMarketResearchEnabled] = useState(false);
  const [researchData, setResearchData] = useState('');
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState(false);
  const researchDataRef = useRef('');
  useEffect(() => { researchDataRef.current = researchData; }, [researchData]);

  // ── Scoping progress ─────────────────────────────────────────────────────────
  const [scopingRound, setScopingRound] = useState(0);

  // ── Proposal ─────────────────────────────────────────────────────────────────
  const [proposedRecord, setProposedRecord] = useState<ProposedRecord | null>(null);
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [proposalError, setProposalError] = useState(false);

  // ── Groq hook ────────────────────────────────────────────────────────────────
  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const {
    streamingText,
    isGenerating,
    generate,
    abort,
    reset: resetGroq,
  } = useGroqProxy({ temperature: 0.7, getAuthHeaders });

  // Track generation completion to commit streaming text into chat history
  const prevIsGeneratingRef = useRef(false);
  const streamingTextRef = useRef('');
  useEffect(() => { streamingTextRef.current = streamingText; }, [streamingText]);

  useEffect(() => {
    if (prevIsGeneratingRef.current && !isGenerating) {
      const text = streamingTextRef.current;
      if (text) {
        setChatMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: text },
        ]);
        llmHistoryRef.current = [
          ...llmHistoryRef.current,
          { role: 'assistant', content: text },
        ];
        if (stageRef.current === 'scoping') setScopingRound((r) => r + 1);
      }
      resetGroq();
    }
    prevIsGeneratingRef.current = isGenerating;
  }, [isGenerating, resetGroq]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamingText]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const addAssistantMessage = (content: string, variant?: ChatMessage['variant']) => {
    setChatMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'assistant', content, variant },
    ]);
  };

  const rebuildSystemPrompt = useCallback(
    (persona: BrandPersona | null, imgAnalysis: string, research: string) => {
      const prompt = buildScopingSystemPrompt(persona, entityType, imgAnalysis, research, language);
      systemPromptRef.current = prompt;
      return prompt;
    },
    [entityType, language],
  );

  // ── Open ─────────────────────────────────────────────────────────────────────

  const handleOpen = useCallback(async () => {
    setIsOpen(true);
    setStage('idle');
    setChatMessages([]);
    llmHistoryRef.current = [];
    setScopingRound(0);
    setUserInput('');
    setUploadedFile(null);
    setImageAnalysis('');
    setResearchData('');
    setResearchError(false);
    setProposedRecord(null);
    setProposalError(false);
    resetGroq();

    setLoadingPersona(true);
    setPersonaError(false);
    let persona: BrandPersona | null = null;
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/api/system/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        persona = (await res.json()) as BrandPersona;
        setBrandPersona(persona);
      } else {
        setPersonaError(true);
      }
    } catch {
      setPersonaError(true);
    }
    setLoadingPersona(false);

    const sysPrompt = rebuildSystemPrompt(persona, '', '');
    setStage('scoping');

    const welcome = t('aiInterviewWelcome', { entityLabel });
    setChatMessages([{ id: 'welcome', role: 'assistant', content: welcome }]);

    const firstUserMsg = `Start the interview. Ask your first question about the ${entityType}.`;
    llmHistoryRef.current = [{ role: 'user', content: firstUserMsg }];
    await generate([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: firstUserMsg },
    ]);
  }, [entityType, entityLabel, t, rebuildSystemPrompt, generate, resetGroq]);

  // ── Close ────────────────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    if (isGenerating) abort();
    resetGroq();
    setIsOpen(false);
  }, [isGenerating, abort, resetGroq]);

  // ── Send message ─────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = userInput.trim();
    if (!text || isGenerating || generatingProposal) return;

    setUserInput('');
    setChatMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: text },
    ]);
    llmHistoryRef.current = [...llmHistoryRef.current, { role: 'user', content: text }];

    if (stageRef.current === 'scoping' || stageRef.current === 'negotiating') {
      await generate([
        { role: 'system', content: systemPromptRef.current },
        ...llmHistoryRef.current,
      ]);
    }
  }, [userInput, isGenerating, generatingProposal, generate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Image upload ──────────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(
    async (file: File) => {
      setUploadedFile(file);
      setAnalyzingImage(true);

      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i] as number);
        const base64 = btoa(binary);

        const token = getAccessToken();
        const res = await fetch('/api/ollama/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            model: 'gemma3:4b',
            prompt: `Analyze this ${entityType} image for a business catalog. Extract: name, key features, visible text, specifications, materials, and suggested catalog metadata. Be specific and concise.`,
            images: [base64],
            stream: false,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as { response?: string };
          const analysis = data.response ?? '';
          setImageAnalysis(analysis);
          rebuildSystemPrompt(brandPersonaRef.current, analysis, researchDataRef.current);
          addAssistantMessage(`${t('aiInterviewImageAnalysis')}\n\n${analysis}`, 'research');
        } else {
          addAssistantMessage(t('aiInterviewImageAnalysisError'));
        }
      } catch {
        addAssistantMessage(t('aiInterviewImageAnalysisError'));
      }

      setAnalyzingImage(false);
    },
    [entityType, t, rebuildSystemPrompt],
  );

  // ── Market research ───────────────────────────────────────────────────────────

  const handleResearch = useCallback(async () => {
    setResearching(true);
    setResearchError(false);

    const entityNameGuess = String(
      values['name'] ?? values['en_name'] ?? entityLabel,
    );
    const brandName = brandPersonaRef.current?.site_name ?? '';
    const query = `${entityNameGuess} ${entityType} pricing description ${brandName}`.trim();

    try {
      const token = getAccessToken();
      const res = await fetch('/api/scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, maxResults: 5 }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          results?: { title: string; url: string; snippet: string }[];
        };
        const results = data.results ?? [];
        if (results.length) {
          const summary = results
            .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`)
            .join('\n\n');
          setResearchData(summary);
          rebuildSystemPrompt(brandPersonaRef.current, imageAnalysisRef.current, summary);
          addAssistantMessage(`${t('aiInterviewResearchResults')}\n\n${summary}`, 'research');
        } else {
          addAssistantMessage(t('aiInterviewResearchNoResults'), 'research');
        }
      } else {
        setResearchError(true);
        addAssistantMessage(t('aiInterviewErrorResearch'));
      }
    } catch {
      setResearchError(true);
      addAssistantMessage(t('aiInterviewErrorResearch'));
    }

    setResearching(false);
  }, [entityType, entityLabel, values, t, rebuildSystemPrompt]);

  // ── Generate proposal ─────────────────────────────────────────────────────────

  const handleGenerateProposal = useCallback(async () => {
    if (isGenerating || generatingProposal) return;

    if (marketResearchEnabled && !researchDataRef.current) {
      setStage('researching');
      await handleResearch();
    }

    setStage('proposal');
    setGeneratingProposal(true);
    setProposalError(false);

    try {
      const conversationText = llmHistoryRef.current
        .filter((m) => m.role !== 'system')
        .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n');

      const proposalMsgs = buildProposalMessages(
        brandPersonaRef.current,
        entityType,
        conversationText,
        imageAnalysisRef.current,
        researchDataRef.current,
        language,
      );

      const token = getAccessToken();
      const res = await fetch('/api/groq/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: proposalMsgs,
          stream: false,
          temperature: 0.3,
        }),
      });

      if (!res.ok) throw new Error('Proposal request failed');

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const rawContent = data.choices?.[0]?.message?.content ?? '';

      let parsed: ProposedRecord | null = null;
      try {
        parsed = JSON.parse(rawContent) as ProposedRecord;
      } catch {
        const match = rawContent.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]) as ProposedRecord;
      }

      if (!parsed) throw new Error('Could not parse proposal JSON');

      setProposedRecord(parsed);

      if (parsed.brand_alignment_notes) {
        addAssistantMessage(
          `${t('aiInterviewBrandWarning')}: ${parsed.brand_alignment_notes}`,
          'warning',
        );
      }

      addAssistantMessage(t('aiInterviewProposalNote'), 'proposal');
    } catch {
      setProposalError(true);
      addAssistantMessage(t('aiInterviewErrorProposal'));
    }

    setGeneratingProposal(false);
  }, [
    isGenerating,
    generatingProposal,
    marketResearchEnabled,
    entityType,
    language,
    t,
    handleResearch,
  ]);

  // ── Apply proposal ────────────────────────────────────────────────────────────

  const handleApply = useCallback(() => {
    if (!proposedRecord) return;

    const formFieldKeys = new Set(fields.map((f) => f.key));
    const skipKeys = new Set(['justification', 'brand_alignment_notes']);

    for (const [key, value] of Object.entries(proposedRecord)) {
      if (skipKeys.has(key)) continue;
      if (formFieldKeys.has(key) && value !== null && value !== undefined) {
        onChange(key, String(value));
      }
    }

    if (formFieldKeys.has('is_ai_generated')) onChange('is_ai_generated', true);

    setStage('confirmed');
    addAssistantMessage(t('aiInterviewApplied'));
  }, [proposedRecord, fields, onChange, t]);

  // ── Negotiate ─────────────────────────────────────────────────────────────────

  const handleNegotiate = useCallback(() => {
    setStage('negotiating');
    const negotiationAddendum = `\n\nThe proposal has been generated. The user now wants to negotiate. Help them refine the proposal based on feedback. After agreeing on changes, remind them to click "Generate Proposal" to regenerate.`;
    systemPromptRef.current = systemPromptRef.current + negotiationAddendum;
    addAssistantMessage(t('aiInterviewNegotiatePrompt'));
  }, [t]);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const stageIndex = (s: InterviewStage) => VISIBLE_STAGES.indexOf(s);
  const currentIndex = stageIndex(stage);
  const canSend =
    !isGenerating &&
    !generatingProposal &&
    !analyzingImage &&
    !researching &&
    userInput.trim().length > 0 &&
    (stage === 'scoping' || stage === 'negotiating');

  const canGenerateProposal =
    stage === 'scoping' &&
    scopingRound >= MIN_SCOPING_ROUNDS &&
    !isGenerating &&
    !generatingProposal;

  const stageLabelMap: Partial<Record<InterviewStage, string>> = {
    scoping: t('aiInterviewStageScoping'),
    researching: t('aiInterviewStageResearching'),
    proposal: t('aiInterviewStageProposal'),
    confirmed: t('aiInterviewStageDone'),
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Trigger button ── */}
      <Button
        unstyled
        className="aii__trigger"
        onClick={handleOpen}
        aria-label={t('aiInterviewLabel')}
        title={t('aiInterviewLabel')}
      >
        <Icon icon="/icons/enhance.svg" size="15px" color="var(--accent, #06b6d4)" />
        <Typography as="span" variant="none" className="aii__trigger-label">
          {t('aiInterviewLabel')}
        </Typography>
      </Button>

      {/* ── Modal ── */}
      {isOpen && (
        <div
          className="aii__overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('aiInterviewTitle', { entityLabel })}
        >
          <div className="aii__panel">
            {/* Header */}
            <Box
              className="aii__header"
              display="flex"
              alignItems="center"
              justifyContent="space-between"
            >
              <Box display="flex" alignItems="center" gap={10}>
                <Icon icon="/icons/enhance.svg" size="18px" color="var(--accent, #06b6d4)" />
                <Typography as="h2" variant="h5" className="aii__title">
                  {t('aiInterviewTitle', { entityLabel })}
                </Typography>
              </Box>
              <Button
                unstyled
                className="aii__close-btn"
                onClick={handleClose}
                aria-label={t('aiInterviewClose')}
              >
                <Icon icon="/icons/x.svg" size="16px" color="var(--foreground)" />
              </Button>
            </Box>

            {/* Stage indicator */}
            <Box className="aii__stages" display="flex" alignItems="center">
              {VISIBLE_STAGES.map((s, i) => (
                <Fragment key={s}>
                  <div
                    className={[
                      'aii__stage',
                      currentIndex === stageIndex(s) ? 'aii__stage--active' : '',
                      currentIndex > stageIndex(s) ? 'aii__stage--done' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {stageLabelMap[s]}
                  </div>
                  {i < VISIBLE_STAGES.length - 1 && (
                    <div className="aii__stage-sep" />
                  )}
                </Fragment>
              ))}
            </Box>

            {/* Chat area */}
            <div className="aii__chat">
              {loadingPersona && (
                <Box display="flex" alignItems="center" gap={8} className="aii__status-row">
                  <Spinner size={14} />
                  <Typography variant="body-sm">{t('aiInterviewLoadingBrand')}</Typography>
                </Box>
              )}
              {personaError && (
                <Typography variant="body-sm" className="aii__error-note">
                  {t('aiInterviewErrorPersona')}
                </Typography>
              )}
              {researchError && (
                <Typography variant="body-sm" className="aii__error-note">
                  {t('aiInterviewErrorResearch')}
                </Typography>
              )}
              {proposalError && (
                <Typography variant="body-sm" className="aii__error-note">
                  {t('aiInterviewErrorProposal')}
                </Typography>
              )}

              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={[
                    'aii__msg',
                    `aii__msg--${msg.role}`,
                    msg.variant ? `aii__msg--${msg.variant}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <Typography variant="body-sm" className="aii__msg-text">
                    {msg.content}
                  </Typography>
                </div>
              ))}

              {/* Proposal card (shown in proposal / negotiating / confirmed stages) */}
              {proposedRecord &&
                (stage === 'proposal' || stage === 'negotiating' || stage === 'confirmed') && (
                  <div className="aii__proposal-card">
                    <Typography as="p" variant="none" className="aii__proposal-heading">
                      {t('aiInterviewProposalTitle')}
                    </Typography>
                    <div className="aii__proposal-grid">
                      {Object.entries(proposedRecord)
                        .filter(
                          ([k, v]) =>
                            !['justification', 'brand_alignment_notes'].includes(k) &&
                            v !== null &&
                            v !== undefined &&
                            v !== '',
                        )
                        .map(([key, value]) => (
                          <div key={key} className="aii__proposal-field">
                            <span className="aii__proposal-field-label">
                              {PROPOSAL_FIELD_LABELS[key] ?? key}
                            </span>
                            <span className="aii__proposal-field-value">
                              {String(value)}
                            </span>
                          </div>
                        ))}
                    </div>
                    {proposedRecord.justification && (
                      <p className="aii__proposal-justification">
                        {proposedRecord.justification as string}
                      </p>
                    )}
                    {(stage === 'proposal' || stage === 'negotiating') && (
                      <Box display="flex" gap={8} marginTop={8}>
                        <Button text={t('aiInterviewAccept')} onClick={handleApply} />
                        {stage === 'proposal' && (
                          <Button
                            text={t('aiInterviewNegotiate')}
                            unstyled
                            className="af__btn-cancel"
                            onClick={handleNegotiate}
                          />
                        )}
                        {stage === 'negotiating' && (
                          <Button
                            text={t('aiInterviewContinue')}
                            unstyled
                            className="af__btn-cancel"
                            onClick={handleGenerateProposal}
                          />
                        )}
                      </Box>
                    )}
                  </div>
                )}

              {/* Live streaming text */}
              {isGenerating && streamingText && (
                <div className="aii__msg aii__msg--assistant aii__msg--streaming">
                  <Typography variant="body-sm" className="aii__msg-text">
                    {streamingText}
                  </Typography>
                </div>
              )}

              {/* Async loading indicators */}
              {(analyzingImage || researching || generatingProposal) && (
                <div className="aii__msg aii__msg--assistant">
                  <Box display="flex" alignItems="center" gap={8}>
                    <Spinner size={14} />
                    <Typography variant="body-sm">
                      {analyzingImage
                        ? t('aiInterviewAnalyzing')
                        : researching
                          ? t('aiInterviewResearching')
                          : t('aiInterviewGenerating')}
                    </Typography>
                  </Box>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Toolbar */}
            <Box className="aii__toolbar" display="flex" alignItems="center" flexWrap="wrap" gap={10}>
              {/* Image upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="aii__file-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = '';
                }}
              />
              <Button
                unstyled
                className="aii__upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={analyzingImage}
                title={t('aiInterviewUpload')}
                aria-label={t('aiInterviewUpload')}
              >
                <Icon icon="/icons/link.svg" size="14px" color="var(--foreground)" />
                <Typography as="span" variant="none" className="aii__upload-label">
                  {uploadedFile ? uploadedFile.name : t('aiInterviewUpload')}
                </Typography>
              </Button>

              {/* Market research toggle */}
              <Box display="flex" alignItems="center" gap={6}>
                <Switch checked={marketResearchEnabled} onChange={setMarketResearchEnabled} />
                <Typography as="span" variant="body-sm">
                  {t('aiInterviewMarketResearch')}
                </Typography>
              </Box>

              {/* Generate proposal CTA */}
              {canGenerateProposal && (
                <Button
                  text={t('aiInterviewContinue')}
                  onClick={handleGenerateProposal}
                  className="aii__proposal-cta"
                />
              )}
            </Box>

            {/* Input row */}
            {stage !== 'confirmed' && (
              <Box className="aii__input-row" display="flex" alignItems="center" gap={8}>
                <SpeechButton
                  language={locale}
                  onTranscript={(text) =>
                    setUserInput((prev) => (prev ? `${prev} ${text}` : text))
                  }
                  micIcon="/icons/mic.svg"
                />
                <div className="aii__input-wrap" onKeyDown={handleKeyDown}>
                  <TextInput
                    value={userInput}
                    onChange={setUserInput}
                    placeholder={t('aiInterviewPlaceholder')}
                    disabled={
                      isGenerating ||
                      generatingProposal ||
                      analyzingImage ||
                      researching ||
                      stage === 'proposal'
                    }
                    className="aii__input"
                  />
                </div>
                <Button
                  unstyled
                  className={[
                    'aii__send-btn',
                    canSend ? 'aii__send-btn--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={handleSend}
                  disabled={!canSend}
                  aria-label={t('aiInterviewSend')}
                >
                  →
                </Button>
              </Box>
            )}

            {/* Confirmed footer */}
            {stage === 'confirmed' && (
              <Box
                className="aii__footer"
                display="flex"
                justifyContent="flex-end"
                padding="12px 20px"
              >
                <Button text={t('aiInterviewClose')} onClick={handleClose} />
              </Box>
            )}
          </div>
        </div>
      )}
    </>
  );
}
