export default async function SiteGatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f4f5",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <form
        method="POST"
        action="/api/site-gate"
        style={{
          background: "#fff",
          padding: "2rem",
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          width: 320,
        }}
      >
        <h1 style={{ fontSize: 18, marginBottom: 16 }}>パスワードを入力してください</h1>
        <input type="hidden" name="next" value={nextPath} />
        <input
          type="password"
          name="password"
          autoFocus
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #d4d4d8",
            borderRadius: 8,
            marginBottom: 12,
            boxSizing: "border-box",
            fontSize: 14,
          }}
        />
        {error && (
          <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>パスワードが違います</p>
        )}
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "#18181b",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          進む
        </button>
      </form>
    </main>
  );
}
