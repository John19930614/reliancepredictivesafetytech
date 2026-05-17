export function resolveWebsiteContentValue(
  content: Map<string, string>,
  fallbackByKey: Map<string, string>,
  contentKey: string,
) {
  return content.get(contentKey) ?? fallbackByKey.get(contentKey) ?? "";
}
