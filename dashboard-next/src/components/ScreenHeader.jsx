export default function ScreenHeader({ num, label, right = "LOCAL SIMULATION" }) {
  return (
    <div className="screen-header">
      <div className="screen-label">
        <span className="num">{num}</span>
        <span>/</span>
        <span>{label}</span>
      </div>
      <svg className="glyph-divider" viewBox="0 0 84 12" fill="none" aria-hidden="true">
        <path d="M.5 1.5h83v9h-68l-5-4-5 4H.5z" stroke="currentColor" strokeOpacity=".55" />
        <path d="M17 2v8M24 3l5 6M32 3l5 6M42 3h8M55 3h4M63 3h10" stroke="currentColor" strokeOpacity=".45" />
        <path d="m25 2 5 8m5-8 5 8" stroke="currentColor" strokeOpacity=".75" strokeWidth="2" />
      </svg>
      <span className="screen-index">{right}</span>
    </div>
  );
}
