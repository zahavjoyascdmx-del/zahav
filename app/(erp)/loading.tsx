export default function Loading() {
  return (
    <div>
      <div className="skeleton" style={{ width: 220, height: 28, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: 360, height: 14, marginBottom: 22 }} />
      <div className="grid grid-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 92 }} />)}
      </div>
      <div className="skeleton" style={{ height: 320, marginTop: 14 }} />
    </div>
  );
}
