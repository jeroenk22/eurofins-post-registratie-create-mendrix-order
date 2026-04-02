import { describe, expect, it } from "vitest";
import { buildCustomLinkXml } from "../customlink-xml.js";
import type { OrderData } from "../types.js";

const baseOrder: OrderData = {
  clientId: 3699,
  contact: "Jan Jansen",
  reference: "REF-001",
  referenceYour: "",
  notes: "",
  moment: "2026-04-10T08:00:00",
  taakType: 2,
  adres: {
    naam: "Eurofins BLGG",
    locatie: "Bij de roldeur",
    straat: "Binnenhaven",
    huisnummer: "5",
    postcode: "6709PD",
    plaats: "Wageningen",
    land: "Nederland",
    landcode: "NL",
  },
  gewenstVan: "2026-04-10T08:00:00",
  gewenstTot: "2026-04-10T17:00:00",
  instructies: "Bel aan",
  trackTrace: "",
  goederen: [
    { verpakking: "Doos", aantal: 2, gewicht: 5.5, volume: 0.05 },
  ],
};

describe("buildCustomLinkXml", () => {
  it("bevat de juiste root-tag", () => {
    const xml = buildCustomLinkXml(baseOrder);
    expect(xml).toContain('Type="TEoCustomLinkStoreOrdersNormal"');
  });

  it("zet de clientId correct", () => {
    const xml = buildCustomLinkXml(baseOrder);
    expect(xml).toContain("<Id>3699</Id>");
  });

  it("negatieve GoodId begint bij -1", () => {
    const xml = buildCustomLinkXml(baseOrder);
    expect(xml).toContain("<Id>-1</Id>");
  });

  it("koppelt goed aan taak via GoodsToTasks", () => {
    const xml = buildCustomLinkXml(baseOrder);
    expect(xml).toContain("TEoGoodToTaskMx");
    expect(xml).toContain("<Id>-1001</Id>");
  });

  it("escapet speciale tekens in adresvelden", () => {
    const order: OrderData = {
      ...baseOrder,
      adres: { ...baseOrder.adres, naam: "Jan & Co <BV>" },
    };
    const xml = buildCustomLinkXml(order);
    expect(xml).toContain("Jan &amp; Co &lt;BV&gt;");
    expect(xml).not.toContain("Jan & Co");
  });

  it("gebruikt huidig tijdstip als moment ontbreekt", () => {
    const { moment: _omit, ...orderZonderMoment } = baseOrder;
    const order: OrderData = orderZonderMoment;
    const xml = buildCustomLinkXml(order);
    // Controleert dat er een ISO-achtige string in <Moment> staat
    expect(xml).toMatch(/<Moment>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}<\/Moment>/);
  });

  it("zet ReferenceYour ook in EoTaskMx", () => {
    const order: OrderData = { ...baseOrder, referenceYour: "Spoed" };
    const xml = buildCustomLinkXml(order);
    // Moet twee keer voorkomen: één op orderniveau, één op taakniveau
    const matches = xml.match(/<ReferenceYour>Spoed<\/ReferenceYour>/g);
    expect(matches).toHaveLength(2);
  });

  it("bevat geen ProductId als productId ontbreekt", () => {
    const xml = buildCustomLinkXml(baseOrder);
    expect(xml).not.toContain("ProductId");
    expect(xml).not.toContain("ProductIdAutomaticArticles");
  });

  it("zet ProductId en ProductIdAutomaticArticles als productId aanwezig is", () => {
    const order: OrderData = { ...baseOrder, productId: 37 };
    const xml = buildCustomLinkXml(order);
    expect(xml).toContain("<Id>37</Id>");
    expect(xml).toContain("<ProductIdAutomaticArticles>True</ProductIdAutomaticArticles>");
  });

  it("laat Packing weg als verpakking leeg is", () => {
    const order: OrderData = {
      ...baseOrder,
      goederen: [{ aantal: 1 }],
    };
    const xml = buildCustomLinkXml(order);
    expect(xml).not.toContain("TEoPackingMx");
  });

  it("genereert meerdere goederen met oplopende negatieve IDs", () => {
    const order: OrderData = {
      ...baseOrder,
      goederen: [{ aantal: 1 }, { aantal: 2 }, { aantal: 3 }],
    };
    const xml = buildCustomLinkXml(order);
    expect(xml).toContain("<Id>-1</Id>");
    expect(xml).toContain("<Id>-2</Id>");
    expect(xml).toContain("<Id>-3</Id>");
  });
});
