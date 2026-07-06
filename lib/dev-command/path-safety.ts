const DESTRUCTIVE_PATH_PATTERNS = [
  /^supabase\/migrations\/.+\.sql$/i,
  /^\.env(\..+)?$/i,
  /^\.github\/workflows\//i,
  /middleware\.ts$/i,
  /^lib\/supabase\/(server|admin)\.ts$/i,
];

const SENSITIVE_KEYWORDS = ["auth", "rls", "policy", "permission", "role", "secret", "credential"];

export function isDestructive(changeType: string, filePath: string) {
  if (changeType === "delete") {
    return true;
  }

  return DESTRUCTIVE_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function checkPath(filePath: string) {
  const normalized = filePath.trim().replace(/^\/+/, "");
  const lower = normalized.toLowerCase();

  return {
    path: normalized,
    touchesSensitiveArea: SENSITIVE_KEYWORDS.some((keyword) => lower.includes(keyword)),
    isOutsideRepo: normalized.startsWith("..") || normalized.includes("../"),
  };
}
