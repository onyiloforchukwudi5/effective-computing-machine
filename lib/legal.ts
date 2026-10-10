// Owner-specific legal details come from env vars with safe fallbacks (nothing is invented).
export const legal = {
  entity: () => process.env.LEGAL_ENTITY_NAME?.trim() || "Mail CRM",
  contact: () => process.env.LEGAL_CONTACT_EMAIL?.trim() || "",
  effective: () => process.env.LEGAL_EFFECTIVE_DATE?.trim() || "2026-10-10",
  governingLaw: () => process.env.LEGAL_GOVERNING_LAW?.trim() || "",
};

export const contactText = () => legal.contact() || "the contact address provided by the operator of this service";
