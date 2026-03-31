import { describe, expect, it } from "vitest";
import { entryPhotos, entryToOrder, formatColliInstructie, formatNlDatetime, nextWorkday } from "../payload-mapper.js";
import type { EntryPayload, WebhookPayload } from "../types.js";

type SenderInfo = Pick<WebhookPayload, "sender_name" | "sender_phone" | "sender_email">;

const sender: SenderInfo = {
  sender_name: "Jeroen",
  sender_phone: "0610451806",
  sender_email: "jeroen@test.nl",
};

const entry: EntryPayload = {
  entry_number: 1,
  shelf: "Schap 1",
  recipient: "K306 - Koen Weghorst (Halle)",
  colli: 2,
  colli_omschrijvingen: ["Doos", "Emmer"],
  spoed: true,
  photo_count: 1,
  photos: [
    { filename: "image.png", base64: "data:image/jpeg;base64,/9j/abc" },
  ],
};

// ---------------------------------------------------------------------------
// entryToOrder
// ---------------------------------------------------------------------------

describe("entryToOrder", () => {
  it("zet sender naam met (via Postapp) in contact", () => {
    const order = entryToOrder(entry, sender, 3699);
    expect(order.contact).toBe("Jeroen (via Postapp)");
  });

  it("laat reference leeg (Orderkenmerk niet invullen)", () => {
    const order = entryToOrder(entry, sender, 3699);
    expect(order.reference).toBe("");
  });

  it("zet referenceYour op 'Spoed' als spoed=true", () => {
    const order = entryToOrder(entry, sender, 3699);
    expect(order.referenceYour).toBe("Spoed");
  });

  it("laat referenceYour leeg als spoed=false", () => {
    const order = entryToOrder({ ...entry, spoed: false }, sender, 3699);
    expect(order.referenceYour).toBe("");
  });

  it("zet aanmeldingtekst met sender naam in notes", () => {
    const order = entryToOrder(entry, sender, 3699);
    expect(order.notes).toMatch(/^Aangemeld via postapp door Jeroen \(\d{2}-\d{2}-\d{4} om \d{2}:\d{2} uur\)$/);
  });

  it("maakt één goed per colli_omschrijving (standaard: Colli + opmerkingen)", () => {
    const order = entryToOrder(entry, sender, 3699);
    expect(order.goederen).toHaveLength(2);
    expect(order.goederen[0]?.verpakking).toBe("Colli");
    expect(order.goederen[0]?.opmerkingen).toBe("Doos");
    expect(order.goederen[1]?.verpakking).toBe("Colli");
    expect(order.goederen[1]?.opmerkingen).toBe("Emmer");
  });

  it("elke goed heeft aantal 1", () => {
    const order = entryToOrder(entry, sender, 3699);
    expect(order.goederen.every((g) => g.aantal === 1)).toBe(true);
  });

  it("instructies bevat SPOED achteraan bij spoed=true", () => {
    const order = entryToOrder(entry, sender, 3699);
    expect(order.instructies).toContain("afleveren SPOED");
  });

  it("instructies bevat colli omschrijvingen eindigend met afleveren SPOED", () => {
    const order = entryToOrder(entry, sender, 3699);
    expect(order.instructies).toContain("Doos en emmer afleveren SPOED");
  });

  it("voegt schap niet toe aan instructies", () => {
    const order = entryToOrder(entry, sender, 3699);
    expect(order.instructies).not.toContain("Schap:");
  });

  it("zet recipient als adres.naam zonder plaatsnaam tussen haakjes", () => {
    const order = entryToOrder(entry, sender, 3699);
    expect(order.adres.naam).toBe("K306 - Koen Weghorst");
  });

  it("verwijdert plaatsnaam tussen haakjes aan het einde van recipient", () => {
    const order = entryToOrder({ ...entry, recipient: "Te Bokkel Loonbedrijf (Aalten)" }, sender, 3699);
    expect(order.adres.naam).toBe("Te Bokkel Loonbedrijf");
  });

  it("verwijdert plaatsnaam ook als naam een streepje bevat", () => {
    const order = entryToOrder({ ...entry, recipient: "FD12 - Ruud Wieggers (Marienvelde)" }, sender, 3699);
    expect(order.adres.naam).toBe("FD12 - Ruud Wieggers");
  });

  it("laat naam zonder haakjes ongewijzigd", () => {
    const order = entryToOrder({ ...entry, recipient: "Gewone Naam" }, sender, 3699);
    expect(order.adres.naam).toBe("Gewone Naam");
  });

  it("taakType is altijd 2 (ophalen)", () => {
    const order = entryToOrder(entry, sender, 3699);
    expect(order.taakType).toBe(2);
  });

  it("geen SPOED in instructies als spoed=false", () => {
    const order = entryToOrder({ ...entry, spoed: false }, sender, 3699);
    expect(order.instructies).not.toContain("SPOED");
  });

  it("fallback naar colli-aantal als omschrijvingen leeg is", () => {
    const order = entryToOrder(
      { ...entry, colli: 3, colli_omschrijvingen: [] },
      sender,
      3699
    );
    expect(order.goederen).toHaveLength(3);
  });

  it("minimaal één goed als colli=0 en omschrijvingen leeg", () => {
    const order = entryToOrder(
      { ...entry, colli: 0, colli_omschrijvingen: [] },
      sender,
      3699
    );
    expect(order.goederen).toHaveLength(1);
  });

  describe("recipient_type goederen mapping", () => {
    it("monsternemer: verpakking=Colli, opmerkingen=omschrijving", () => {
      const order = entryToOrder(
        { ...entry, recipient_type: "monsternemer", colli_omschrijvingen: ["Doos", "Emmer"] },
        sender,
        3699
      );
      expect(order.goederen[0]?.verpakking).toBe("Colli");
      expect(order.goederen[0]?.opmerkingen).toBe("Doos");
      expect(order.goederen[1]?.verpakking).toBe("Colli");
      expect(order.goederen[1]?.opmerkingen).toBe("Emmer");
    });

    it("ap06: verpakking=Colli, opmerkingen=omschrijving", () => {
      const order = entryToOrder(
        { ...entry, recipient_type: "ap06", colli_omschrijvingen: ["Fles"] },
        sender,
        3699
      );
      expect(order.goederen[0]?.verpakking).toBe("Colli");
      expect(order.goederen[0]?.opmerkingen).toBe("Fles");
    });

    it("mestklant: verpakking=omschrijving, geen opmerkingen", () => {
      const order = entryToOrder(
        { ...entry, recipient_type: "mestklant", colli_omschrijvingen: ["Ton"] },
        sender,
        3699
      );
      expect(order.goederen[0]?.verpakking).toBe("Ton");
      expect(order.goederen[0]?.opmerkingen).toBeUndefined();
    });

    it("geen recipient_type: standaard verpakking=Colli, opmerkingen=omschrijving", () => {
      const order = entryToOrder(
        { ...entry, colli_omschrijvingen: ["Zak"] },
        sender,
        3699
      );
      expect(order.goederen[0]?.verpakking).toBe("Colli");
      expect(order.goederen[0]?.opmerkingen).toBe("Zak");
    });
  });
});

// ---------------------------------------------------------------------------
// spoed clientId / productId
// ---------------------------------------------------------------------------

describe("spoed clientId en productId", () => {
  const base = { ...entry, spoed: true, photos: [] };

  it("mestklant (ongeacht land): clientId=3582, productId=37", () => {
    const order = entryToOrder({ ...base, recipient_type: "mestklant", land: "Duitsland" }, sender, 3699);
    expect(order.clientId).toBe(3582);
    expect(order.productId).toBe(37);
  });

  it("monsternemer Nederland: clientId=3351, productId=37", () => {
    const order = entryToOrder({ ...base, recipient_type: "monsternemer", land: "Nederland" }, sender, 3699);
    expect(order.clientId).toBe(3351);
    expect(order.productId).toBe(37);
  });

  it("monsternemer Duitsland: clientId=3352, productId=37", () => {
    const order = entryToOrder({ ...base, recipient_type: "monsternemer", land: "Duitsland" }, sender, 3699);
    expect(order.clientId).toBe(3352);
    expect(order.productId).toBe(37);
  });

  it("monsternemer België: clientId=3552, productId=37", () => {
    const order = entryToOrder({ ...base, recipient_type: "monsternemer", land: "België" }, sender, 3699);
    expect(order.clientId).toBe(3552);
    expect(order.productId).toBe(37);
  });

  it("ap06 (ongeacht land): clientId=3551, productId=37", () => {
    const order = entryToOrder({ ...base, recipient_type: "ap06", land: "België" }, sender, 3699);
    expect(order.clientId).toBe(3551);
    expect(order.productId).toBe(37);
  });

  it("geen spoed: gebruikt config clientId, productId=DUMMY (60)", () => {
    const order = entryToOrder({ ...base, spoed: false, recipient_type: "mestklant" }, sender, 3699);
    expect(order.clientId).toBe(3699);
    expect(order.productId).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// formatColliInstructie
// ---------------------------------------------------------------------------

describe("formatColliInstructie", () => {
  it("enkelvoudige unieke omschrijvingen: kommagescheiden met en en afleveren", () => {
    expect(formatColliInstructie(["Doos", "Emmer"])).toBe("Doos en emmer afleveren");
  });

  it("duplicaten: Nx prefix", () => {
    expect(formatColliInstructie(["Doos", "Doos", "Doos", "Rode zak", "Doosje"])).toBe(
      "3x doos, doosje en rode zak afleveren"
    );
  });

  it("doos + iets: dozen meervoud bij 2 of meer", () => {
    expect(
      formatColliInstructie(["Doos deksels", "Doos deksels", "Grote doos sealrollen (10 doosjes)"])
    ).toBe("2 dozen deksels en grote doos sealrollen afleveren");
  });

  it("doosje krijgt geen dozen-meervoud, wel Nx prefix", () => {
    expect(
      formatColliInstructie([
        "Doosje sealrollen",
        "Doosje sealrollen",
        "Doosje sealrollen",
        "Grote doos sealrollen (10 doosjes)",
      ])
    ).toBe("3x doosje sealrollen en grote doos sealrollen afleveren");
  });

  it("verpakking mapping: Setje insteekhoezen → insteekhoezen", () => {
    expect(formatColliInstructie(["Setje insteekhoezen"])).toBe("Insteekhoezen afleveren");
  });

  it("verpakking mapping: Grote doos vaste mestzakken (500 stuks) → doos vaste mestzakken", () => {
    expect(formatColliInstructie(["Grote doos vaste mestzakken (500 stuks)"])).toBe(
      "Doos vaste mestzakken afleveren"
    );
  });

  it("verpakking mapping: Setje vaste mestzakken (50 stuks) → setje vaste mestzakken", () => {
    expect(formatColliInstructie(["Setje vaste mestzakken (50 stuks)"])).toBe(
      "Setje vaste mestzakken afleveren"
    );
  });

  it("verpakking mapping: Grote doos sealrollen (10 doosjes) → grote doos sealrollen", () => {
    expect(formatColliInstructie(["Grote doos sealrollen (10 doosjes)"])).toBe(
      "Grote doos sealrollen afleveren"
    );
  });

  it("enkelvoudig: geen komma, alleen afleveren", () => {
    expect(formatColliInstructie(["Doos"])).toBe("Doos afleveren");
  });

  it("lege lijst: lege string", () => {
    expect(formatColliInstructie([])).toBe("");
  });

  it("sorteert alfabetisch op gemapte naam", () => {
    expect(formatColliInstructie(["Rode zak", "Doos", "Emmer"])).toBe(
      "Doos, emmer en rode zak afleveren"
    );
  });
});

// ---------------------------------------------------------------------------
// entryPhotos
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// formatNlDatetime
// ---------------------------------------------------------------------------

describe("formatNlDatetime", () => {
  it("formatteert datum en tijd correct", () => {
    expect(formatNlDatetime(new Date("2026-03-31T09:05:00"))).toBe("31-03-2026 om 09:05 uur");
  });

  it("voegt voorloopnullen toe bij enkelvoudige dag/maand/uur/minuut", () => {
    expect(formatNlDatetime(new Date("2026-01-07T08:03:00"))).toBe("07-01-2026 om 08:03 uur");
  });
});

// ---------------------------------------------------------------------------
// nextWorkday
// ---------------------------------------------------------------------------

describe("nextWorkday", () => {
  it("maandag t/m donderdag → volgende dag", () => {
    expect(nextWorkday(new Date("2026-03-30"))).toBe("2026-03-31"); // maandag→dinsdag
    expect(nextWorkday(new Date("2026-04-02"))).toBe("2026-04-03"); // donderdag→vrijdag
  });

  it("vrijdag → maandag (weekend overslaan)", () => {
    expect(nextWorkday(new Date("2026-04-03"))).toBe("2026-04-06");
  });

  it("zaterdag → maandag", () => {
    expect(nextWorkday(new Date("2026-04-04"))).toBe("2026-04-06");
  });

  it("zondag → maandag", () => {
    expect(nextWorkday(new Date("2026-04-05"))).toBe("2026-04-06");
  });
});

// ---------------------------------------------------------------------------

describe("entryPhotos", () => {
  it("extraheert base64-strings uit photos array", () => {
    const fotos = entryPhotos(entry);
    expect(fotos).toHaveLength(1);
    expect(fotos[0]).toBe("data:image/jpeg;base64,/9j/abc");
  });

  it("geeft lege array terug bij geen foto's", () => {
    expect(entryPhotos({ ...entry, photos: [] })).toEqual([]);
  });
});
