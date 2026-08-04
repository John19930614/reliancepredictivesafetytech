// Setup for the `dom` vitest project ONLY (see vitest.config.ts). The node
// project lists no setupFiles, so nothing in here runs for the pure suites.
//
//   * jest-dom matchers (`toBeDisabled`, `toBeInTheDocument`, …) — the disabled
//     assertions the proposal RBAC tests lean on read far better than manual
//     `hasAttribute` checks.
//   * Testing Library's auto-cleanup does not self-register without
//     `globals: true`, so unmounting between tests is wired up explicitly here.
//     Without it every render would stack in the same document and text queries
//     would start matching the previous test's output.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
