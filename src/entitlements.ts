export type Tier='free'|'pro';
export const FREE_LIMITS={timetables:2,places:1,alertsPerTimetable:1}as const;
export const PRO_PRODUCT_IDS={ios:'busbell_pro_lifetime',android:'busbell_pro_lifetime'}as const;
// Purchases remain intentionally disabled until signed products exist in both stores.
// Never grant Pro based only on a client-side toggle; verify native store receipts.
export const STORE_PURCHASES_CONFIGURED=false;
