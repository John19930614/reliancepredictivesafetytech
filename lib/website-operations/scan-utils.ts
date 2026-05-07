export type WebsiteLinkFinding = {
  href: string;
  label: string;
  status: "ok" | "warning" | "error";
  reason: string;
};

export type WebsiteSeoSnapshot = {
  title: string | null;
  description: string | null;
  h1: string | null;
  contentGaps: string[];
};

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

export function extractLinksFromHtml(html: string) {
  const links: Array<{ href: string; label: string }> = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const attributeText = match[1] ?? "";
    const hrefMatch = attributeText.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "";

    if (href) {
      links.push({ href: decodeEntities(href.trim()), label: stripTags(match[2] ?? "") || href });
    }
  }

  return links;
}

export function inspectLinks(links: Array<{ href: string; label: string }>, internalRoutes: readonly string[]) {
  const internalRouteSet = new Set(internalRoutes);

  return links.map<WebsiteLinkFinding>((link) => {
    const href = link.href.trim();

    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return { ...link, href, status: "ok", reason: "Non-page link." };
    }

    if (href.startsWith("http://") || href.startsWith("https://")) {
      return { ...link, href, status: "warning", reason: "External link requires periodic review." };
    }

    if (href.startsWith("/")) {
      const [pathWithoutHash] = href.split("#", 1);
      const [pathWithoutQuery] = pathWithoutHash.split("?", 1);
      const normalizedPath = pathWithoutQuery === "" ? "/" : pathWithoutQuery;

      return internalRouteSet.has(normalizedPath)
        ? { ...link, href, status: "ok", reason: "Known internal route." }
        : { ...link, href, status: "error", reason: "Internal route is not in the managed route list." };
    }

    return { ...link, href, status: "error", reason: "Unsupported or relative link target." };
  });
}

function matchContent(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1] ? stripTags(match[1]) : null;
}

export function inspectSeo(html: string): WebsiteSeoSnapshot {
  const title = matchContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1] ??
    html.match(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i)?.[1] ??
    null;
  const h1 = matchContent(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const contentGaps: string[] = [];

  if (!title || title.length < 12) {
    contentGaps.push("Missing or short page title.");
  }

  if (!description || description.length < 50) {
    contentGaps.push("Missing or short meta description.");
  }

  if (!h1) {
    contentGaps.push("Missing H1.");
  }

  return {
    title,
    description: description ? decodeEntities(description.trim()) : null,
    h1,
    contentGaps,
  };
}

export function buildWebsiteNotificationDedupeKey(sourceType: string, sourceId: string, label: string) {
  return `website:${sourceType}:${sourceId}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)}`;
}
