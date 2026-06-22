import type { AuditEventPayload } from "@/lib/audit/builders";

export type ValidationCheckKey =
  | "structural"
  | "referential"
  | "logic"
  | "source"
  | "safety"
  | "privacy"
  | "confidence"
  | "nothing_missed";

export interface GatewayValidationCheck {
  key: ValidationCheckKey;
  label: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
}

export interface GatewayValidationResult {
  status: "pass" | "warn" | "fail" | "blocked";
  checks: GatewayValidationCheck[];
  overallConfidence: number;
  requiresHumanReview: boolean;
  blockedReason?: string;
}

export interface GatewayInput {
  promptKey?: string;
  rawOutput: string;
  expectedSchema?: Record<string, unknown>;
  confidenceThreshold?: number;
  safetyContext?: string;
}

export function validateAIOutput(input: GatewayInput): GatewayValidationResult {
  const checks: GatewayValidationCheck[] = [];
  const threshold = input.confidenceThreshold ?? 0.70;

  // Structural check — output must be non-empty and parseable if JSON-shaped
  const isNonEmpty = input.rawOutput.trim().length > 0;
  checks.push({
    key: "structural",
    label: "Structural completeness",
    status: isNonEmpty ? "pass" : "fail",
    detail: isNonEmpty ? undefined : "Output is empty",
  });

  // Referential integrity — no unresolved placeholders
  const hasUnresolvedPlaceholders = /\{\{[^}]+\}\}/.test(input.rawOutput);
  checks.push({
    key: "referential",
    label: "Referential integrity",
    status: hasUnresolvedPlaceholders ? "fail" : "pass",
    detail: hasUnresolvedPlaceholders ? "Output contains unresolved template placeholders" : undefined,
  });

  // Logic check — no obvious contradictions (simple heuristic)
  const hasContradiction = /\b(not|never|always|impossible)\b.*\b(but|however|yet|although)\b/i.test(input.rawOutput);
  checks.push({
    key: "logic",
    label: "Logic consistency",
    status: hasContradiction ? "warn" : "pass",
    detail: hasContradiction ? "Potential logical contradiction detected — review recommended" : undefined,
  });

  // Safety check — no harmful instruction patterns
  const BLOCKED_PATTERNS = [
    /\bignore\b.*\binstructions\b/i,
    /\byou are now\b/i,
    /\bdisregard\b.*\bsystem prompt\b/i,
    /\bjailbreak\b/i,
  ];
  const hasSafetyViolation = BLOCKED_PATTERNS.some((p) => p.test(input.rawOutput));
  checks.push({
    key: "safety",
    label: "Safety compliance",
    status: hasSafetyViolation ? "fail" : "pass",
    detail: hasSafetyViolation ? "Output contains blocked instruction pattern" : undefined,
  });

  // Privacy check — no raw SSN/credit card patterns
  const hasPIILeak = /\b\d{3}-\d{2}-\d{4}\b|\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/.test(input.rawOutput);
  checks.push({
    key: "privacy",
    label: "Privacy compliance",
    status: hasPIILeak ? "fail" : "pass",
    detail: hasPIILeak ? "Potential PII (SSN or credit card) detected in output" : undefined,
  });

  // Confidence check — length heuristic (too short may indicate low confidence)
  const wordCount = input.rawOutput.trim().split(/\s+/).length;
  const confidenceHeuristic = Math.min(1, wordCount / 30);
  checks.push({
    key: "confidence",
    label: "Confidence threshold",
    status: confidenceHeuristic >= threshold ? "pass" : "warn",
    detail: confidenceHeuristic < threshold ? `Output may be too brief (confidence ~${(confidenceHeuristic * 100).toFixed(0)}%)` : undefined,
  });

  // Nothing Missed check — required fields present if schema provided
  if (input.expectedSchema) {
    const missingFields = Object.keys(input.expectedSchema).filter(
      (key) => !input.rawOutput.toLowerCase().includes(key.toLowerCase())
    );
    checks.push({
      key: "nothing_missed",
      label: "Nothing missed",
      status: missingFields.length === 0 ? "pass" : "warn",
      detail: missingFields.length > 0 ? `Possibly missing: ${missingFields.join(", ")}` : undefined,
    });
  } else {
    checks.push({ key: "nothing_missed", label: "Nothing missed", status: "pass" });
  }

  // Determine overall status
  const hasBlock = checks.some((c) => c.status === "fail" && (c.key === "safety" || c.key === "structural"));
  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");

  let status: GatewayValidationResult["status"] = "pass";
  if (hasBlock) status = "blocked";
  else if (hasFail) status = "fail";
  else if (hasWarn) status = "warn";

  return {
    status,
    checks,
    overallConfidence: confidenceHeuristic,
    requiresHumanReview: hasFail || hasWarn || confidenceHeuristic < threshold,
    blockedReason: hasBlock ? checks.find((c) => c.status === "fail" && (c.key === "safety" || c.key === "structural"))?.detail : undefined,
  };
}

export function buildAuditEventFromGatewayResult(
  requestId: string,
  promptKey: string | undefined,
  result: GatewayValidationResult,
): Pick<AuditEventPayload, "event_type" | "event_category" | "severity" | "summary" | "after_state"> {
  return {
    event_type: "ai.gateway_validation",
    event_category: "ai",
    severity: result.status === "blocked" ? "error" : result.status === "fail" ? "warn" : "info",
    summary: `AI Gateway: ${result.status.toUpperCase()} for prompt "${promptKey ?? "unknown"}" (request ${requestId})`,
    after_state: {
      status: result.status,
      confidence: result.overallConfidence,
      requiresHumanReview: result.requiresHumanReview,
      failedChecks: result.checks.filter((c) => c.status !== "pass").map((c) => c.key),
    },
  };
}
