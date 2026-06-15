import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const SCRAPER_URL = "https://scraper.iguzman.com.mx/extract";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_CONTENT_CHARS = 12_000;

interface ExtractedJob {
  company_name: string;
  job_title: string;
  job_description: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  work_type: string[];
  location: string;
  us_citizen_or_pr_required: boolean | null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) {
    return NextResponse.json(
      { detail: "Authentication required." },
      { status: 401 },
    );
  }

  const body = (await req.json()) as { url?: string };
  const url = body?.url?.trim() ?? "";
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { detail: "A valid http(s) URL is required." },
      { status: 400 },
    );
  }

  // 1. Scrape the job posting page
  const scraperKey = process.env.SCRAPER_API_KEY ?? "";
  let scraped: { title: string; content: string; image?: string };
  try {
    const scraperRes = await fetch(SCRAPER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(scraperKey ? { "X-API-Key": scraperKey } : {}),
      },
      body: JSON.stringify({ url }),
    });
    if (!scraperRes.ok) {
      const err = await scraperRes.text();
      return NextResponse.json(
        { detail: `Scraper error: ${err}` },
        { status: 502 },
      );
    }
    scraped = (await scraperRes.json()) as {
      title: string;
      content: string;
      image?: string;
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scraper unreachable";
    return NextResponse.json({ detail: message }, { status: 502 });
  }

  // 2. Parse structured fields with Groq
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json(
      { detail: "Groq API key not configured." },
      { status: 500 },
    );
  }

  const content = scraped.content.slice(0, MAX_CONTENT_CHARS);
  const prompt = `You are parsing a job posting. Extract the following fields from the page title and content provided.

Page title: ${scraped.title}

Page content:
${content}

Return a JSON object with exactly these keys:
- "company_name": name of the hiring company (string)
- "job_title": the job position title (string)
- "job_description": the complete job description copied verbatim from the content - include the position summary, responsibilities ("Work you'll do" or equivalent), required and preferred qualifications, and any other role-specific details. Do NOT write "See the provided job posting content" or any other placeholder. If the description spans multiple sections, concatenate them in order (string)
- "salary_min": minimum annual salary as a plain number with no symbols or commas (number or null if not mentioned)
- "salary_max": maximum annual salary as a plain number with no symbols or commas (number or null if not mentioned)
- "salary_currency": currency code, one of "USD", "CAD", "EUR", "MXN", "GBP" (empty string if not mentioned or cannot be determined)
- "work_type": array of applicable work arrangements from ["remote", "onsite", "hybrid"] (empty array if not mentioned)
- "location": city, state, country, or "Remote" as stated in the posting (empty string if not mentioned)
- "us_citizen_or_pr_required": true if the posting explicitly requires U.S. citizenship or permanent residence, false if it explicitly states no such requirement, null if not mentioned

Use null for salary fields when no salary information is present. Do not include any other keys.`;

  let extracted: ExtractedJob;
  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return NextResponse.json(
        { detail: `Groq error: ${errText}` },
        { status: 502 },
      );
    }
    const groqData = (await groqRes.json()) as {
      choices: { message: { content: string } }[];
    };
    extracted = JSON.parse(
      groqData.choices[0]!.message.content,
    ) as ExtractedJob;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to parse job details";
    return NextResponse.json({ detail: message }, { status: 502 });
  }

  return NextResponse.json({
    company_name: String(extracted.company_name ?? ""),
    job_title: String(extracted.job_title ?? ""),
    job_description: String(extracted.job_description ?? ""),
    image_url: scraped.image ?? null,
    salary_min:
      typeof extracted.salary_min === "number" ? extracted.salary_min : null,
    salary_max:
      typeof extracted.salary_max === "number" ? extracted.salary_max : null,
    salary_currency: String(extracted.salary_currency ?? ""),
    work_type: Array.isArray(extracted.work_type) ? extracted.work_type : [],
    location: String(extracted.location ?? ""),
    us_citizen_or_pr_required:
      typeof extracted.us_citizen_or_pr_required === "boolean"
        ? extracted.us_citizen_or_pr_required
        : null,
  });
}
