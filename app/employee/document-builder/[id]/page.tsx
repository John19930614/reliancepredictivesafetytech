import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getDocumentAccess } from "@/lib/documents/access";
import { DraftReviewPanel } from "@/components/document-builder/DraftReviewPanel";
import type { DocType, DocumentSection } from "@/lib/documents/types";

export default async function DraftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, isAdmin, isReviewer } = await getDocumentAccess();
  if (!supabase) notFound();

  const { data: draft } = await supabase
    .from("document_builder_drafts")
    .select(
      "id, doc_type, title, sections, review_status, confidence_level, human_review_required, review_reason, company_document_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!draft) notFound();

  const normalized = {
    id: draft.id as string,
    doc_type: draft.doc_type as DocType,
    title: draft.title as string,
    sections: (Array.isArray(draft.sections) ? draft.sections : []) as DocumentSection[],
    review_status: draft.review_status as string,
    confidence_level: (draft.confidence_level ?? null) as string | null,
    human_review_required: Boolean(draft.human_review_required),
    review_reason: (draft.review_reason ?? null) as string | null,
    company_document_id: (draft.company_document_id ?? null) as string | null,
  };

  return (
    <>
      <div className="portal-topline">
        <div>
          <Link href="/employee/document-builder" className="button button-light" style={{ marginBottom: 8 }}>
            <ChevronLeft size={16} /> Back to drafts
          </Link>
          <div className="eyebrow">Document Builder</div>
          <h1>Review draft</h1>
          <p>Edit the draft, approve it, then publish it to the Master Document Library.</p>
        </div>
      </div>

      <DraftReviewPanel draft={normalized} canReview={isReviewer} canPublish={isAdmin} />
    </>
  );
}
