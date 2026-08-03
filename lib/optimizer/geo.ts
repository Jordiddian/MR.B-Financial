// Licensed states per product, mirroring the GEOGRAPHIC LICENSING ENFORCEMENT
// section of the system prompt exactly. This is the code-side counterpart —
// until now, every campaign's real Meta targeting was hardcoded to
// California only regardless of ad_type, so Final Expense/Life campaigns
// (licensed in 11 states) never actually reached the other 10, and Dental/
// Vision (licensed nationwide) never left California either.

const ALL_50_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming',
]

export const PRODUCT_STATES: Record<string, string[]> = {
  // Covered California is a state exchange by definition — CA only.
  'Covered California': ['California'],
  // Medicare Advantage licensing is CA only for this agent.
  'Medicare': ['California'],
  // Standalone Dental/Vision is sold nationwide, not through the CA exchange.
  'Dental': ALL_50_STATES,
  'Vision': ALL_50_STATES,
  'Final Expenses': [
    'Alabama', 'Arizona', 'California', 'Kentucky', 'Michigan',
    'New Jersey', 'North Carolina', 'Pennsylvania', 'Texas', 'Utah', 'Virginia',
  ],
}
