---
name: Consulenza360 — Borsa EuroTLX matching rules
loaded: on demand (scraper, parser, run-status tasks)
---

# Borsa EuroTLX matching rules

v1 scope is EuroTLX only.

Endpoint:

```text
https://www.borsaitaliana.it/borsa/obbligazioni/eurotlx/ricerca-avanzata/risultati.html?isin={ISIN}&lang=it
```

Rules:

- Use `redirect: "manual"`.
- Do not use Cheerio, linkedom, jsdom, or full DOM parsing in the Worker.
- Use bounded string scanning.
- Normalize both HTML and ISIN with `.toUpperCase()`.
- Match only the exact detail-link pattern:

```text
/BORSA/OBBLIGAZIONI/EUROTLX/SCHEDA/{ISIN}-
```

- Do not use fuzzy matching or Levenshtein matching for ISIN detection.
- Do not mark a result present from a plain ISIN occurrence, because absent pages can
  echo the ISIN in sorting links.
- Mark the run `blocked` on repeated 403, 429, challenge-like HTML, or redirects.
- If Borsa blocks Cloudflare Worker traffic: mark `blocked`, never downgrade parser
  quality or fabricate successes. Runner/proxy changes are a human decision.
