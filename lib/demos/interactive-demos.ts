/**
 * Standalone, self-contained HTML product demos served from `public/demos`.
 *
 * Each file is a single-file mock (inline CSS + JS, no external requests) so it
 * can be embedded in an iframe or opened directly during a sales call.
 */
export interface InteractiveDemo {
  key: string;
  label: string;
  href: string;
  description: string;
}

export const interactiveDemos: InteractiveDemo[] = [
  {
    key: "safepredict",
    label: "SafePredict Guided Demo",
    href: "/demos/safepredict-interactive-demo.html",
    description: "Click-through guided walkthrough of the SafePredict predictive safety command center.",
  },
  {
    key: "aeris",
    label: "AERIS App Demo",
    href: "/demos/aeris-app-demo.html",
    description: "Interactive AERIS app mock: clients, tools, assessments, sign-off queue, documents, and usage.",
  },
];
