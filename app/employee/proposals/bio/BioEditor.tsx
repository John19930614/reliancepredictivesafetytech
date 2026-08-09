"use client";

// Self-service editor for the signed-in employee's proposal bio and signature.
//
// Two independent forms rather than one: the bio is text the seller iterates on,
// the signature is a file they set once. Combining them would mean re-uploading
// the image every time a sentence changes.

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Eraser, Save, Upload } from "lucide-react";
import { clearOwnSignature, saveOwnBio, saveOwnSignature } from "./actions";
import { bioLimits } from "./limits";

export interface BioEditorProps {
  initial: {
    displayName: string;
    title: string;
    bio: string;
    isPublishable: boolean;
  };
  /** Data URI of the stored signature, or null when none is saved. */
  signaturePreview: string | null;
  signatureUpdatedAt: string | null;
}

export function BioEditor({ initial, signaturePreview, signatureUpdatedAt }: BioEditorProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bio, setBio] = useState(initial.bio);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  function run(work: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await work();
      if (result.ok) setNotice(successMessage);
      else setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div>
      {error ? <div className="success-box portal-alert portal-alert-error">{error}</div> : null}
      {notice ? <div className="success-box portal-alert">{notice}</div> : null}

      <form
        className="form-panel"
        action={(formData) => run(() => saveOwnBio(formData), "Bio saved.")}
      >
        <h2 style={{ marginTop: 0 }}>Your bio</h2>
        <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>
          This is what a client reads about you. When someone preparing a proposal checks your name, these words are
          printed in the document&apos;s Your Team section.
        </p>

        <div className="field">
          <label htmlFor="bio-display-name">Name as it should appear</label>
          <input
            id="bio-display-name"
            name="display_name"
            defaultValue={initial.displayName}
            maxLength={bioLimits.displayName}
            placeholder="John Haldemann"
            disabled={pending}
          />
        </div>

        <div className="field">
          <label htmlFor="bio-title">Title</label>
          <input
            id="bio-title"
            name="title"
            defaultValue={initial.title}
            maxLength={bioLimits.title}
            placeholder="Founder &amp; Principal Safety Strategist"
            disabled={pending}
          />
        </div>

        <div className="field">
          <label htmlFor="bio-body">Bio</label>
          <textarea
            id="bio-body"
            name="bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={9}
            maxLength={bioLimits.bio}
            placeholder={"Leave a blank line between paragraphs.\n\nEach paragraph prints separately in the proposal."}
            disabled={pending}
          />
          <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>
            {bio.length} / {bioLimits.bio} characters · blank lines separate paragraphs
          </p>
        </div>

        <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            name="is_publishable"
            defaultChecked={initial.isPublishable}
            disabled={pending}
            style={{ width: "auto" }}
          />
          <span>Make my bio available to select on proposals</span>
        </label>

        <button className="button button-primary" type="submit" disabled={pending}>
          <Save size={16} /> {pending ? "Saving…" : "Save bio"}
        </button>
      </form>

      <form
        className="form-panel"
        style={{ marginTop: 20 }}
        action={(formData) => run(() => saveOwnSignature(formData), "Signature saved.")}
      >
        <h2 style={{ marginTop: 0 }}>Your signature</h2>
        <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>
          Upload a picture of your signature on white paper, cropped tight. When you sign a proposal the platform
          places this image in the seller acceptance block, so you never have to print, sign, and scan.
        </p>

        {signaturePreview ? (
          <div
            style={{
              display: "inline-block",
              padding: 12,
              marginBottom: 12,
              border: "1px solid var(--portal-line, #dbe2e9)",
              borderRadius: 8,
              background: "#fff",
            }}
          >
            {/* Unoptimized: the source is a data: URI resolved from a private
                bucket, which the image optimizer cannot fetch or cache. */}
            <Image
              src={signaturePreview}
              alt="Your saved signature"
              width={260}
              height={70}
              unoptimized
              style={{ width: "auto", height: "auto", maxWidth: 260, maxHeight: 70 }}
            />
          </div>
        ) : (
          <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>
            No signature saved yet — proposals will print a blank signature line for you.
          </p>
        )}

        {signatureUpdatedAt ? (
          <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem" }}>
            Last updated {new Date(signatureUpdatedAt).toLocaleDateString()}
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="signature-file">Signature image (PNG or JPEG · max 512 KB)</label>
          <input
            id="signature-file"
            ref={signatureInputRef}
            name="signature"
            type="file"
            accept="image/png,image/jpeg"
            disabled={pending}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="button button-primary" type="submit" disabled={pending}>
            <Upload size={16} /> {signaturePreview ? "Replace signature" : "Upload signature"}
          </button>
          {signaturePreview ? (
            <button
              className="button button-light"
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Remove your saved signature? Proposals will print a blank line instead.")) return;
                run(() => clearOwnSignature(), "Signature removed.");
              }}
            >
              <Eraser size={16} /> Remove
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
