// Interest names per product, mirroring the INTEREST-BASED TARGETING section
// of the system prompt exactly — that section is the AI's own reasoning
// about what to recommend, but until now nothing ever turned "interest"
// audience_type into a real Meta targeting spec. This is the code-side
// counterpart: real interest names the interest-based experiment arm
// resolves to actual Meta interest IDs and applies to the live campaign.

export const PRODUCT_INTERESTS: Record<string, string[]> = {
  'Covered California': [
    'Health insurance', 'Affordable Care Act', 'Blue Shield of California',
    'Anthem Blue Cross', 'Self-employment', 'Small business',
  ],
  'Medicare': [
    'Medicare', 'AARP', 'Retirement planning', 'Social Security', 'Senior living',
  ],
  'Dental': [
    'Dental care', 'Dentist', 'Health and wellness',
  ],
  'Vision': [
    'Eye care', 'Optometrist', 'Vision insurance', 'Contact lenses',
  ],
  'Final Expenses': [
    'Life insurance', 'Estate planning', 'Funeral planning', 'Family finances',
  ],
}
