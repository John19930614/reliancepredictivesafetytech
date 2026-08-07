import { ScrollText } from "lucide-react";
import { certExpiryWarningDays, type CertificationCoverage } from "@/lib/talent-engine/types";
import { TalentCard, TalentEmpty } from "./TalentCard";
import { clampPercent, formatPercent } from "./format";

/**
 * Verified-certification coverage across the active pool, plus the expiry
 * warning window.
 *
 * A meter is a <div role="progressbar"> with the value also printed as text
 * beside its label, so the number is readable rather than implied by the length
 * of a bar.
 */
function meterClass(pct: number): string {
  if (pct >= 90) return "talent-meter-fill";
  if (pct >= 70) return "talent-meter-fill talent-meter-warn";
  return "talent-meter-fill talent-meter-alert";
}

export function CertificationTracker({
  coverage,
  expiringCount,
  poolSize,
}: {
  coverage: CertificationCoverage[];
  /** Candidates whose cert_expiry_date falls inside the warning window. */
  expiringCount: number;
  /** Active pool size — the denominator for the expiry meter. */
  poolSize: number;
}) {
  const expiringPct = poolSize > 0 ? clampPercent((expiringCount / poolSize) * 100) : 0;

  return (
    <TalentCard icon={<ScrollText size={15} />} title="Certification Tracker">
      {coverage.length === 0 && expiringCount === 0 ? (
        <TalentEmpty
          hint="Once candidates carry certifications, this tracks how many are verified — an unverified required cert blocks submittal."
          title="No certifications on file yet"
        />
      ) : (
        <>
          {coverage.map((item) => {
            const pct = clampPercent(item.verifiedPct);
            return (
              <div className="talent-cert" key={item.certification}>
                <p className="talent-cert-label">
                  <span>{item.certification} verified</span>
                  <span className="talent-cert-value">
                    {formatPercent(item.verifiedPct)} · {item.verifiedCount}/{item.heldCount}
                  </span>
                </p>
                <div
                  aria-label={`${item.certification} verified`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={Math.round(pct)}
                  aria-valuetext={`${Math.round(pct)} percent verified, ${item.verifiedCount} of ${item.heldCount}`}
                  className="talent-meter"
                  role="progressbar"
                >
                  <span className={meterClass(pct)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}

          <div className="talent-cert">
            <p className="talent-cert-label">
              <span>Expiring &lt; {certExpiryWarningDays} days</span>
              <span className="talent-cert-value">
                {expiringCount} {expiringCount === 1 ? "worker" : "workers"}
              </span>
            </p>
            <div
              aria-label={`Certifications expiring within ${certExpiryWarningDays} days`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(expiringPct)}
              aria-valuetext={`${expiringCount} of ${poolSize} active candidates`}
              className="talent-meter"
              role="progressbar"
            >
              <span className="talent-meter-fill talent-meter-alert" style={{ width: `${expiringPct}%` }} />
            </div>
          </div>
        </>
      )}
    </TalentCard>
  );
}
