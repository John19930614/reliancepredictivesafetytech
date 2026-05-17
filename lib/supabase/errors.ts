type SupabaseQueryError = {
  code?: string;
  message?: string;
};

export function isMissingSchemaRelationError(error: SupabaseQueryError | null | undefined) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "PGRST205" ||
    (message.includes("could not find the table") && message.includes("schema cache")) ||
    (message.includes("could not find the relation") && message.includes("schema cache"))
  );
}

export function getOptionalFeatureSetupMessage(featureName: string) {
  return `${featureName} is not set up in Supabase yet. Apply the latest database migrations and try again.`;
}
