import type { BlockedResult, CheckResult, ClaimedIsin, Env } from "./types";

const DEFAULT_ENDPOINT =
  "https://www.borsaitaliana.it/borsa/obbligazioni/eurotlx/ricerca-avanzata/risultati.html";

const BLOCKED_MARKERS = [
  "ACCESS DENIED",
  "AKAMAI",
  "BOT DETECTION",
  "REQUEST BLOCKED",
  "JAVASCRIPT CHALLENGE",
  "UNUSUAL TRAFFIC",
  "FORBIDDEN",
];

export function buildEurotlxUrl(env: Pick<Env, "BORSA_ENDPOINT_BASE">, isin: string) {
  const base = env.BORSA_ENDPOINT_BASE ?? DEFAULT_ENDPOINT;
  const url = new URL(base);
  url.searchParams.set("isin", isin.toUpperCase());
  url.searchParams.set("lang", "it");
  return url.toString();
}

function stripTags(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRow(html: string, detailIndex: number) {
  const upper = html.toUpperCase();
  const rowStart = upper.lastIndexOf("<TR", detailIndex);
  const rowEnd = upper.indexOf("</TR>", detailIndex);
  if (rowStart === -1 || rowEnd === -1 || rowEnd <= rowStart) return null;
  return html.slice(rowStart, rowEnd + 5);
}

function extractFields(rowHtml: string) {
  const text = stripTags(rowHtml);
  return {
    row_text: text,
  };
}

export function detectChallengeLikeHtml(html: string) {
  const upper = html.toUpperCase();
  return BLOCKED_MARKERS.some((marker) => upper.includes(marker));
}

export function parseEurotlxHtml(html: string, isin: string): Pick<CheckResult, "status" | "parsed_fields"> | "blocked" {
  const normalizedHtml = html.toUpperCase();
  const normalizedIsin = isin.toUpperCase();

  if (detectChallengeLikeHtml(normalizedHtml)) {
    return "blocked";
  }

  const detailPattern = `/BORSA/OBBLIGAZIONI/EUROTLX/SCHEDA/${normalizedIsin}-`;
  const detailIndex = normalizedHtml.indexOf(detailPattern);
  if (detailIndex === -1) {
    return {
      status: "absent",
      parsed_fields: {},
    };
  }

  const rowHtml = extractRow(html, detailIndex);
  return {
    status: "present",
    parsed_fields: rowHtml ? extractFields(rowHtml) : {},
  };
}

export async function checkEurotlxIsin(env: Env, item: ClaimedIsin): Promise<CheckResult | BlockedResult> {
  const isin = item.isin.toUpperCase();
  const sourceUrl = buildEurotlxUrl(env, isin);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Borsa request timed out."), 10_000);

  try {
    const response = await fetch(sourceUrl, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "it-IT,it;q=0.9,en;q=0.7",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
    });

    const responseTime = Date.now() - startedAt;
    const checkedAt = new Date().toISOString();

    if ([301, 302, 303, 307, 308, 403, 429].includes(response.status)) {
      return {
        kind: "blocked",
        isin,
        reason: `Borsa returned blocking status ${response.status}.`,
        source_url: sourceUrl,
        response_time: responseTime,
        status_code: response.status,
      };
    }

    if (!response.ok) {
      return {
        isin,
        status: "error",
        parsed_fields: {},
        source_url: sourceUrl,
        response_time: responseTime,
        error_message: `Borsa returned HTTP ${response.status}.`,
        checked_at: checkedAt,
      };
    }

    const html = await response.text();
    const parsed = parseEurotlxHtml(html, isin);
    if (parsed === "blocked") {
      return {
        kind: "blocked",
        isin,
        reason: "Borsa returned challenge-like HTML.",
        source_url: sourceUrl,
        response_time: responseTime,
        status_code: response.status,
      };
    }

    return {
      isin,
      status: parsed.status,
      parsed_fields: {
        ...parsed.parsed_fields,
        bond_name: item.bond_name,
      },
      source_url: sourceUrl,
      response_time: responseTime,
      error_message: null,
      checked_at: checkedAt,
    };
  } catch (error) {
    return {
      isin,
      status: "error",
      parsed_fields: {},
      source_url: sourceUrl,
      response_time: Date.now() - startedAt,
      error_message: error instanceof Error ? error.message : "Fetch failed.",
      checked_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

