/**
 * Internationalisation strings.
 * Structure mirrors Arabic translation keys — swap `en` for `ar` and set
 * <html dir="rtl" lang="ar"> in layout.tsx when Arabic is enabled.
 */
export const en = {
  brand: {
    name: "Metricly",
    tagline: "Psychometric Intelligence",
  },
  nav: {
    backToDashboard: "Back to Dashboard",
    docs: "Docs",
    api: "API",
  },
  dashboard: {
    eyebrow: "Psychometric Engine",
    title: "Measurement tools built for the Arab world",
    subtitle:
      "Scientifically rigorous, practitioner-ready modules for reliability, factor structure, and bias detection.",
    modulesHeading: "Available modules",
  },
  modules: {
    alpha: {
      name: "Cronbach's Alpha",
      description:
        "Compute internal consistency reliability for multi-item scales. Returns α, item-total correlations, and α-if-deleted diagnostics.",
      category: "Reliability",
    },
    omega: {
      name: "McDonald's Omega",
      description:
        "CFA-based reliability estimate via principal factor extraction. Superior to α when items have unequal loadings.",
      category: "Reliability",
    },
    efa: {
      name: "Exploratory Factor Analysis",
      description:
        "Principal axis factoring with Kaiser and scree retention criteria, communalities, and a unidimensionality flag.",
      category: "Factor Structure",
    },
    dif: {
      name: "DIF Bias Detection",
      description:
        "Detect Differential Item Functioning across two groups using Mantel-Haenszel and logistic regression with ETS effect size classification.",
      category: "Bias Analysis",
    },
  },
  runner: {
    alpha: {
      title: "Cronbach's Alpha",
      subtitle:
        "Paste or upload a response matrix — rows are respondents, columns are items.",
      inputLabel: "Response data",
      pasteTab: "Paste CSV",
      uploadTab: "Upload CSV",
      pastePlaceholder:
        "Paste your response matrix here.\nEach row is a respondent; each column is an item.\nExample:\n4,3,5,4\n2,2,3,2\n5,4,5,5",
      hasHeaderLabel: "First row is a header",
      scaleNameLabel: "Scale name",
      scaleNamePlaceholder: "e.g. Job Engagement Scale (optional)",
      loadSample: "Load sample data",
      run: "Run Analysis",
      running: "Running…",
      resultsHeading: "Results",
      summaryAlpha: "Cronbach's α",
      summaryItems: "Items",
      summaryRespondents: "Respondents",
      diagnosticsHeading: "Item Diagnostics",
      colItem: "Item",
      colItemTotal: "Item-Total r",
      colAlphaDeleted: "α if deleted",
      colDelta: "Δ",
    },
  },
  errors: {
    parseError: "Could not parse CSV",
    apiError: "API error",
    noData: "Paste or upload data to get started.",
  },
} as const

export type Translations = typeof en
