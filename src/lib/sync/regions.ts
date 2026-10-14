/** ISO 3166-1 alpha-2 → portfolio region name. Unlisted codes get no region. */
const GROUPS: Record<string, string> = {
  "East Africa": "KE TZ UG RW BI ET ER DJ SO SS MG MU SC KM YT RE",
  "Southern Africa": "ZA NA BW ZW ZM MW MZ LS SZ AO",
  "West Africa": "BJ TG GH NG SN GM GW GN SL LR CI BF ML NE MR CV SH",
  "Central Africa": "CM CF TD CG CD GA GQ ST",
  "North Africa & Middle East": "MA DZ TN LY EG SD EH AE SA QA OM BH KW YE JO LB SY IQ IR IL PS TR",
  Asia: "CN JP KR KP MN TW HK MO IN PK BD LK NP BT MV AF ID MY SG TH VN LA KH MM PH BN TL KZ UZ TM KG TJ AZ AM GE",
  Oceania: "AU NZ FJ PG SB VU WS TO KI TV NR PW FM MH NC PF CK NU",
  "North America": "US CA GL PM BM",
  Caribbean: "CU JM HT DO PR BS BB TT AG DM GD KN LC VC AW CW SX BQ KY TC VG VI AI MS GP MQ BL MF",
  "Latin America": "MX GT BZ SV HN NI CR PA CO VE EC PE BO PY UY AR CL BR GY SR GF FK",
  Europe: "GB IE FR DE ES PT IT NL BE LU CH AT DK NO SE FI IS EE LV LT PL CZ SK HU SI HR BA RS ME MK AL GR BG RO MD UA BY RU MT CY AD MC SM VA LI GI FO AX JE GG IM XK",
};

const BY_CODE = new Map<string, string>();
for (const [region, codes] of Object.entries(GROUPS)) for (const c of codes.split(" ")) BY_CODE.set(c, region);

export function regionForCountry(code: string | null | undefined): string | null {
  return code ? (BY_CODE.get(code.toUpperCase()) ?? null) : null;
}

export const ALL_REGION_NAMES = Object.keys(GROUPS);
