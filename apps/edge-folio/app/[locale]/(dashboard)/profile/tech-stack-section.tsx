"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Toast } from "@repo/ui/core-elements/toast";
import { getProfile, saveOnboarding } from "@/lib/auth";
import { getPopularTechStacks } from "@/lib/career";

const FALLBACK_TECH_SUGGESTIONS = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "C#",
  "Ruby",
  "PHP",
  "React",
  "Next.js",
  "Vue",
  "Angular",
  "Svelte",
  "Node.js",
  "Django",
  "FastAPI",
  "Spring Boot",
  ".NET",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "Docker",
  "Kubernetes",
  "AWS",
  "GCP",
  "Azure",
  "GraphQL",
  "REST",
  "gRPC",
  "Terraform",
  "Linux",
];

function TechTagInput({
  tags,
  onChange,
  suggestions,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
}) {
  const t = useTranslations("ProfilePage");
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim().replace(/,$/, "");
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function toggleSuggestion(tech: string) {
    if (tags.includes(tech)) removeTag(tech);
    else addTag(tech);
  }

  return (
    <Box display="flex" flexDirection="column" gap={12}>
      <Typography
        as="label"
        variant="body"
        fontWeight={600}
        color="var(--foreground, #1a1a1a)"
      >
        {t("techStackLabel")}
      </Typography>

      <Box display="flex" flexDirection="column" gap={6}>
        <Typography variant="label" color="var(--muted-foreground, #6b7280)">
          {t("techStackHint")}
        </Typography>
        <Box display="flex" flexWrap="wrap" gap={6}>
          {(suggestions ?? FALLBACK_TECH_SUGGESTIONS).map((tech) => (
            <Button
              key={tech}
              unstyled
              type="button"
              className={[
                "profile__suggestion",
                tags.includes(tech) ? "profile__suggestion--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => toggleSuggestion(tech)}
            >
              {tech}
            </Button>
          ))}
        </Box>
      </Box>

      <TextInput
        ref={inputRef}
        placeholder={t("techStackPlaceholder")}
        value={input}
        onChange={setInput}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (input.trim()) addTag(input);
        }}
        aria-label={t("techStackLabel")}
        width="100%"
      />

      {tags.length > 0 && (
        <Box
          display="flex"
          flexWrap="wrap"
          gap={8}
          className="profile__tags"
          marginTop={10}
        >
          {tags.map((tag) => (
            <Box key={tag} className="profile__tag">
              <Typography variant="body">{tag}</Typography>
              <Button
                unstyled
                type="button"
                className="profile__tag-remove"
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
              >
                ×
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * TechStackPanel - editable preferred tech stack with popular-tech suggestions.
 * Rendered as bare content; the caller supplies the surrounding card.
 */
export function TechStackPanel() {
  const t = useTranslations("ProfilePage");

  const [loading, setLoading] = useState(true);
  const [techStack, setTechStack] = useState<string[]>([]);
  const [savingStack, setSavingStack] = useState(false);
  const [stackSuccess, setStackSuccess] = useState(false);
  const [stackError, setStackError] = useState<string | null>(null);
  const [popularTechSuggestions, setPopularTechSuggestions] = useState<
    string[]
  >(FALLBACK_TECH_SUGGESTIONS);

  useEffect(() => {
    Promise.all([getProfile(), getPopularTechStacks()])
      .then(([p, popular]) => {
        setTechStack(p.preferred_stack.map((ts) => ts.name));
        const lower = new Set(
          FALLBACK_TECH_SUGGESTIONS.map((s) => s.toLowerCase()),
        );
        const apiOnly = popular.results
          .map((ts) => ts.name)
          .filter((n) => !lower.has(n.toLowerCase()));
        setPopularTechSuggestions([...FALLBACK_TECH_SUGGESTIONS, ...apiOnly]);
      })
      .catch(() => setStackError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [t]);

  const handleSaveStack = useCallback(async () => {
    setStackError(null);
    setStackSuccess(false);
    setSavingStack(true);
    try {
      await saveOnboarding({ preferred_stack: techStack });
      setStackSuccess(true);
    } catch {
      setStackError(t("techError"));
    } finally {
      setSavingStack(false);
    }
  }, [techStack, t]);

  if (loading) {
    return <ProgressBar label={t("loading")} />;
  }

  return (
    <>
      {stackSuccess && (
        <Toast
          message={t("stackSaved")}
          variant="success"
          position="top-center"
        />
      )}
      {stackError && (
        <Toast message={stackError} variant="error" position="top-center" />
      )}

      <TechTagInput
        tags={techStack}
        onChange={(tags) => {
          setTechStack(tags);
          setStackSuccess(false);
        }}
        suggestions={popularTechSuggestions}
      />
      {savingStack && <ProgressBar label={t("savingStack")} />}
      <Box display="flex" justifyContent="flex-end" marginTop={20}>
        <Button
          text={savingStack ? t("savingStack") : t("saveStack")}
          type="button"
          size="lg"
          kind="primary"
          disabled={savingStack}
          onClick={() => void handleSaveStack()}
        />
      </Box>
    </>
  );
}
