"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { Button } from "@repo/ui/core-elements/button";
import { CodeBlock } from "@repo/ui/core-elements/code-block";
import { Toast } from "@repo/ui/core-elements/toast";

const SCRAPER_BASE = "https://scraper.iguzman.com.mx";
const LS_KEY = "scraper-api-key";

// ── Endpoint documentation ────────────────────────────────────────────────────

const HEALTH_CURL = `curl ${SCRAPER_BASE}/health`;

const HEALTH_RESPONSE = `{ "status": "ok" }`;

const SEARCH_CURL =
  `curl -X POST ${SCRAPER_BASE}/search \\\n` +
  `  -H "Content-Type: application/json" \\\n` +
  `  -H "X-API-Key: YOUR_API_KEY" \\\n` +
  `  -d '{"query":"next.js app router","engine":"duckduckgo","maxResults":5}'`;

const SEARCH_RESPONSE = JSON.stringify(
  {
    results: [
      {
        title: "Getting Started: Installation | Next.js",
        url: "https://nextjs.org/docs/app/getting-started/installation",
        snippet: "System Requirements: Node.js 18.18 or later...",
      },
    ],
  },
  null,
  2,
);

const EXTRACT_CURL =
  `curl -X POST ${SCRAPER_BASE}/extract \\\n` +
  `  -H "Content-Type: application/json" \\\n` +
  `  -H "X-API-Key: YOUR_API_KEY" \\\n` +
  `  -d '{"url":"https://example.com"}'`;

const EXTRACT_RESPONSE = JSON.stringify(
  {
    title: "Example Domain",
    url: "https://example.com",
    content: "This domain is for use in illustrative examples in documents...",
  },
  null,
  2,
);

type ErrorState = { msg: string; id: number } | null;

async function parseBody(res: Response): Promise<string> {
  const text = await res.text();
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function ScraperPanel() {
  const t = useTranslations("HomePage");

  const [apiKey, setApiKey] = useState(() =>
    typeof window === "undefined" ? "" : (localStorage.getItem(LS_KEY) ?? ""),
  );

  const [healthLoading, setHealthLoading] = useState(false);
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<ErrorState>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchEngine, setSearchEngine] = useState("duckduckgo");
  const [searchMaxResults, setSearchMaxResults] = useState("5");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<ErrorState>(null);

  const [extractUrl, setExtractUrl] = useState("");
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractResult, setExtractResult] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<ErrorState>(null);

  const handleApiKeyChange = (v: string) => {
    setApiKey(v);
    localStorage.setItem(LS_KEY, v);
  };

  const runHealth = async () => {
    setHealthLoading(true);
    setHealthResult(null);
    setHealthError(null);
    try {
      const res = await fetch(`${SCRAPER_BASE}/health`);
      const body = await parseBody(res);
      setHealthResult(body);
      if (!res.ok) {
        setHealthError({
          msg: t("scraperErrorServer", { status: res.status }),
          id: Date.now(),
        });
      }
    } catch {
      setHealthError({ msg: t("scraperErrorNetwork"), id: Date.now() });
    } finally {
      setHealthLoading(false);
    }
  };

  const runSearch = async () => {
    setSearchLoading(true);
    setSearchResult(null);
    setSearchError(null);
    try {
      const res = await fetch(`${SCRAPER_BASE}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({
          query: searchQuery,
          engine: searchEngine || "duckduckgo",
          maxResults: Number(searchMaxResults) || 5,
        }),
      });
      const body = await parseBody(res);
      setSearchResult(body);
      if (res.status === 401) {
        setSearchError({ msg: t("scraperErrorUnauthorized"), id: Date.now() });
      } else if (!res.ok) {
        setSearchError({
          msg: t("scraperErrorServer", { status: res.status }),
          id: Date.now(),
        });
      }
    } catch {
      setSearchError({ msg: t("scraperErrorNetwork"), id: Date.now() });
    } finally {
      setSearchLoading(false);
    }
  };

  const runExtract = async () => {
    setExtractLoading(true);
    setExtractResult(null);
    setExtractError(null);
    try {
      const res = await fetch(`${SCRAPER_BASE}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ url: extractUrl }),
      });
      const body = await parseBody(res);
      setExtractResult(body);
      if (res.status === 401) {
        setExtractError({ msg: t("scraperErrorUnauthorized"), id: Date.now() });
      } else if (!res.ok) {
        setExtractError({
          msg: t("scraperErrorServer", { status: res.status }),
          id: Date.now(),
        });
      }
    } catch {
      setExtractError({ msg: t("scraperErrorNetwork"), id: Date.now() });
    } finally {
      setExtractLoading(false);
    }
  };

  return (
    <>
      <Box flexDirection="column" gap={8} marginBottom={40}>
        <Typography as="h2" variant="h3">
          {t("scraperSection")}
        </Typography>
        <Typography as="p" variant="body" color="var(--foreground-muted)">
          {t("scraperIntro")}
        </Typography>
      </Box>

      {/* GET /health */}
      <EndpointPanel
        heading={t("scraperHealthSection")}
        description={t("scraperHealthDescription")}
      >
        <DocLabel>{t("scraperExampleRequest")}</DocLabel>
        <CodeBlock language="bash" code={HEALTH_CURL} />
        <DocLabel>{t("scraperExampleResponse")}</DocLabel>
        <CodeBlock language="json" code={HEALTH_RESPONSE} />
        <Button
          text={t("scraperRunButton")}
          size="md"
          kind="primary"
          isLoading={healthLoading}
          onClick={runHealth}
        />
        {healthResult !== null && (
          <CodeBlock language="json" code={healthResult} marginTop={4} />
        )}
      </EndpointPanel>
      {healthError && (
        <Toast message={healthError.msg} variant="error" key={healthError.id} />
      )}

      {/* POST /search */}
      <EndpointPanel
        heading={t("scraperSearchSection")}
        description={t("scraperSearchDescription")}
      >
        <DocLabel>{t("scraperExampleRequest")}</DocLabel>
        <CodeBlock language="bash" code={SEARCH_CURL} />
        <DocLabel>{t("scraperExampleResponse")}</DocLabel>
        <CodeBlock language="json" code={SEARCH_RESPONSE} />
        <TextInput
          label={t("scraperApiKeyLabel")}
          value={apiKey}
          onChange={handleApiKeyChange}
          type="password"
        />
        <TextInput
          label={t("scraperQueryLabel")}
          value={searchQuery}
          onChange={setSearchQuery}
        />
        <Box display="flex" gap={12}>
          <Select
            label={t("scraperEngineLabel")}
            value={searchEngine}
            onChange={setSearchEngine}
            options={[
              { value: "duckduckgo", label: t("scraperEngineDuckDuckGo") },
              { value: "bing", label: t("scraperEngineBing") },
              { value: "google", label: t("scraperEngineGoogle") },
              { value: "brave", label: t("scraperEngineBrave") },
            ]}
            flexGrow={1}
          />
          <TextInput
            label={t("scraperMaxResultsLabel")}
            value={searchMaxResults}
            onChange={setSearchMaxResults}
            type="number"
            width="140px"
          />
        </Box>
        <Button
          text={t("scraperRunButton")}
          size="md"
          kind="primary"
          isLoading={searchLoading}
          onClick={runSearch}
        />
        {searchResult !== null && (
          <CodeBlock language="json" code={searchResult} marginTop={4} />
        )}
      </EndpointPanel>
      {searchError && (
        <Toast message={searchError.msg} variant="error" key={searchError.id} />
      )}

      {/* POST /extract */}
      <EndpointPanel
        heading={t("scraperExtractSection")}
        description={t("scraperExtractDescription")}
      >
        <DocLabel>{t("scraperExampleRequest")}</DocLabel>
        <CodeBlock language="bash" code={EXTRACT_CURL} />
        <DocLabel>{t("scraperExampleResponse")}</DocLabel>
        <CodeBlock language="json" code={EXTRACT_RESPONSE} />
        <TextInput
          label={t("scraperApiKeyLabel")}
          value={apiKey}
          onChange={handleApiKeyChange}
          type="password"
        />
        <TextInput
          label={t("scraperUrlLabel")}
          value={extractUrl}
          onChange={setExtractUrl}
        />
        <Button
          text={t("scraperRunButton")}
          size="md"
          kind="primary"
          isLoading={extractLoading}
          onClick={runExtract}
        />
        {extractResult !== null && (
          <CodeBlock language="json" code={extractResult} marginTop={4} />
        )}
      </EndpointPanel>
      {extractError && (
        <Toast
          message={extractError.msg}
          variant="error"
          key={extractError.id}
        />
      )}
    </>
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
      styles={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
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
      <Typography as="h2" variant="h3" marginBottom={8}>
        {heading}
      </Typography>
      <Typography
        as="p"
        variant="body"
        color="var(--foreground-muted)"
        marginBottom={16}
      >
        {description}
      </Typography>
      <Box display="flex" flexDirection="column" gap={12}>
        {children}
      </Box>
    </Box>
  );
}
