export default function ScreenHeader({ num, label, right }) {
  return (
    <div className="screen-header">
      <div className="screen-label">
        <span className="num">{num}</span>
        <span className="screen-header-sep">/</span>
        <span>{label}</span>
      </div>
      {right && <span className="screen-index">{right}</span>}
    </div>
  );
}
