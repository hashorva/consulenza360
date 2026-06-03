import { describe, expect, it } from "vitest";
import { parseEurotlxHtml } from "./eurotlx";

describe("parseEurotlxHtml", () => {
  it("marks present only from the EuroTLX detail link pattern", () => {
    const html = `
      <table>
        <tr>
          <td><a href="/borsa/obbligazioni/eurotlx/scheda/XS2317069685-ETLX.html?lang=it">XS2317069685</a></td>
          <td>Isp Green Bond 0.75% 16mz28</td>
        </tr>
      </table>
    `;

    expect(parseEurotlxHtml(html, "xs2317069685")).toMatchObject({
      status: "present",
    });
  });

  it("does not mark absent pages present when the ISIN appears only in sort links", () => {
    const html = `
      <a href="/borsa/obbligazioni/eurotlx/ricerca-avanzata/risultati.html?isin=XS2644414125&amp;lang=it&amp;ord=isin">ISIN</a>
      <table><tr><th>ISIN</th><th>Descrizione</th></tr></table>
    `;

    expect(parseEurotlxHtml(html, "XS2644414125")).toEqual({
      status: "absent",
      parsed_fields: {},
    });
  });

  it("detects challenge-like HTML", () => {
    expect(parseEurotlxHtml("<title>Access Denied</title>", "XS2317069685")).toBe("blocked");
  });
});

