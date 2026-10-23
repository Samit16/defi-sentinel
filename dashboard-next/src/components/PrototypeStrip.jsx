import { Info } from "lucide-react";

export default function PrototypeStrip() {
  return (
    <div className="prototype-strip" role="note">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Info size={13} strokeWidth={2} aria-hidden="true" style={{ color: "var(--muted)" }} />
        Sample mode — results shown are simulated, not from a live scan.
      </span>
    </div>
  );
}
