"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", background: "#f8f5ee", color: "#111a2c", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontFamily: "Georgia, serif" }}>PerkPilot hit turbulence</h1>
          <p>Please reload the app. Your data is stored on this device.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "10px 18px", borderRadius: 999, border: 0, background: "#111a2c", color: "#fff" }}>Reload</button>
        </div>
      </body>
    </html>
  );
}
