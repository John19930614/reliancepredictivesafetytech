/**
 * File Center — one browsing surface for company files and per-client files.
 *
 * An async SERVER component: every read below happens here against Supabase
 * under RLS, and every mutation lives in ./actions.ts (CLAUDE.md: no
 * client-side data mutation). The URL is the whole browsing state — ?scope,
 * ?client and ?folder — so any location is linkable and the back button walks
 * the tree.
 *
 * All folders for the current location are loaded in one query: the current
 * level, the breadcrumb chain and the empty-folder detection all derive from
 * the same map, and the tree is human-curated (shallow), not a crawl.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getFileCenterAccess } from "@/lib/files/access";
import type { CompanyFileRow, FileFolderRow, FileScope } from "@/lib/files/types";
import { FileCenterManager } from "@/components/files/FileCenterManager";

export const metadata: Metadata = {
  title: "File Center",
};

interface FileCenterSearchParams {
  scope?: string;
  client?: string;
  folder?: string;
}

/**
 * URL params are untrusted. Anything that is not a plausible uuid is treated
 * as absent so it never reaches a Postgres uuid cast — or the PostgREST .or()
 * filter string below — as raw text.
 */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(value: string | undefined): string | null {
  return value && uuidPattern.test(value) ? value : null;
}

export default async function FileCenterPage({
  searchParams,
}: {
  searchParams: Promise<FileCenterSearchParams>;
}) {
  const params = await searchParams;
  const { supabase, flags } = await getFileCenterAccess();
  if (!supabase) redirect("/employee-login?message=supabase-required");

  // "client" is the only param value that switches scope; anything else —
  // missing, misspelled, tampered — lands on the company tab.
  const scope: FileScope = params.scope === "client" ? "client" : "company";
  const clientParam = scope === "client" ? uuidParam(params.client) : null;
  const folderParam = uuidParam(params.folder);

  // Client scope with no plausible client renders the picker empty state and
  // loads no folders/files; company scope is always a real location.
  const hasLocation = scope === "company" || clientParam !== null;

  const buildFoldersQuery = () => {
    let query = supabase
      .from("company_file_folders")
      .select("id, parent_id, name, scope, client_id, created_at, updated_at, created_by")
      .eq("scope", scope);
    query = clientParam ? query.eq("client_id", clientParam) : query.is("client_id", null);
    return query.order("name");
  };

  const buildFilesQuery = () => {
    let query = supabase.from("company_files").select("*").eq("scope", scope);
    query = clientParam ? query.eq("client_id", clientParam) : query.is("client_id", null);
    // The folder param can be stale (deleted folder, foreign location) and is
    // only verifiable against the folder set loaded in the same round trip.
    // Widening the filter to "requested folder OR root" costs one extra
    // folder's worth of metadata rows but lets a bad param fall back to root
    // without a second query; the exact level is picked below once the folder
    // set is known. Archived files are included — the UI dims them and offers
    // restore.
    query = folderParam ? query.or(`folder_id.eq.${folderParam},folder_id.is.null`) : query.is("folder_id", null);
    return query.order("created_at", { ascending: false });
  };

  const skip = Promise.resolve({ data: null });
  const [{ data: clientRows }, { data: folderRows }, { data: fileRows }] = await Promise.all([
    supabase.from("company_clients").select("id, name").order("name"),
    hasLocation ? buildFoldersQuery() : skip,
    hasLocation ? buildFilesQuery() : skip,
  ]);

  const clients = (clientRows ?? []) as { id: string; name: string }[];

  // The client param only counts once it matches a real, loaded client row;
  // a plausible-but-unknown uuid degrades to the "pick a client" empty state.
  const clientId =
    scope === "client" && clientParam && clients.some((client) => client.id === clientParam) ? clientParam : null;
  const locationValid = scope === "company" || clientId !== null;

  // PostgREST cannot order by lower(name), so the query's case-sensitive order
  // is re-sorted case-insensitively here.
  const locationFolders = (locationValid ? ((folderRows ?? []) as FileFolderRow[]) : [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const folderById = new Map(locationFolders.map((folder) => [folder.id, folder]));

  // A folder param that is not a folder of THIS location is treated as root.
  const folderId = folderParam && folderById.has(folderParam) ? folderParam : null;

  // Breadcrumb: walk parent links current → root, unshifting into root →
  // current order. The visited set makes a corrupted parent cycle terminate
  // instead of hanging the render.
  const breadcrumb: { id: string; name: string }[] = [];
  const visited = new Set<string>();
  let cursor = folderId ? folderById.get(folderId) : undefined;
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    breadcrumb.unshift({ id: cursor.id, name: cursor.name });
    cursor = cursor.parent_id ? folderById.get(cursor.parent_id) : undefined;
  }

  const folders = locationFolders.filter((folder) => (folder.parent_id ?? null) === folderId);
  const files = (locationValid ? ((fileRows ?? []) as CompanyFileRow[]) : []).filter(
    (file) => (file.folder_id ?? null) === folderId,
  );

  return (
    <FileCenterManager
      data={{
        scope,
        clientId,
        clients,
        folderId,
        breadcrumb,
        folders,
        files,
        canDelete: flags.canDelete,
      }}
    />
  );
}
