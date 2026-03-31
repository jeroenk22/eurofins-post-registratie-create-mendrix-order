// Mendrix client- en product-IDs
// Bron: Mendrix backoffice configuratie

export const PRODUCT = {
  /** AGDISAG — Distributie Agro Overnight (spoed) */
  AGRO_OVERNIGHT: 37,
  /** DUMMY — Levert altijd een 0-tarief (standaard/niet-spoed) */
  DUMMY: 60,
} as const;

export const CLIENT = {
  /** Eurofins Agro monsternemers (NL) */
  MONSTERNEMER_NL: 3351,
  /** Eurofins Agro g&g Duitsland */
  MONSTERNEMER_DE: 3352,
  /** Eurofins Agro g&g AP06 / Gewas */
  AP06: 3551,
  /** Eurofins Agro g&g België */
  MONSTERNEMER_BE: 3552,
  /** Eurofins Agro Mestklanten */
  MESTKLANT: 3582,
  /** DUMMY — Eurofins Post & Emballage (standaard/niet-spoed) */
  DUMMY: 3699,
} as const;
