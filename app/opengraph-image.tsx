import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "VancoCalc Pro — Vancomycin AUC Dosing Calculator";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0f172a",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Accent gradient top bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            background: "linear-gradient(90deg, #0e7490, #06b6d4, #67e8f9)",
          }}
        />

        {/* Subtle grid background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 80% 20%, rgba(6,182,212,0.08) 0%, transparent 60%), radial-gradient(circle at 20% 80%, rgba(14,116,144,0.06) 0%, transparent 50%)",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 72px",
            height: "100%",
            position: "relative",
          }}
        >
          {/* Top section */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Badge row */}
            <div style={{ display: "flex", gap: "12px" }}>
              {["ASHP 2020", "IDSA Guideline", "AUC-Guided"].map((label) => (
                <div
                  key={label}
                  style={{
                    background: "rgba(6,182,212,0.12)",
                    border: "1px solid rgba(6,182,212,0.3)",
                    borderRadius: "20px",
                    padding: "6px 16px",
                    color: "#67e8f9",
                    fontSize: "14px",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Main title */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div
                style={{
                  fontSize: "72px",
                  fontWeight: 800,
                  color: "#f8fafc",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                }}
              >
                VancoCalc Pro
              </div>
              <div
                style={{
                  fontSize: "28px",
                  color: "#94a3b8",
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                }}
              >
                Vancomycin AUC Dosing Calculator
              </div>
            </div>
          </div>

          {/* Bottom section */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            {/* Feature pills */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                "Empiric dosing · Single-level · Two-level adjustment",
                "Salazar-Corcoran · Amputation correction · Methodology card",
              ].map((line) => (
                <div
                  key={line}
                  style={{
                    color: "#64748b",
                    fontSize: "16px",
                    fontWeight: 400,
                  }}
                >
                  {line}
                </div>
              ))}
            </div>

            {/* URL + brand */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "6px",
              }}
            >
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  color: "#06b6d4",
                  letterSpacing: "-0.02em",
                }}
              >
                vanccalc.com
              </div>
              <div style={{ fontSize: "13px", color: "#475569", fontWeight: 500 }}>
                by TheraIntel
              </div>
            </div>
          </div>
        </div>

        {/* Decorative right-side element */}
        <div
          style={{
            position: "absolute",
            right: "-60px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "320px",
            height: "320px",
            borderRadius: "50%",
            border: "1px solid rgba(6,182,212,0.12)",
            boxShadow: "0 0 80px rgba(6,182,212,0.06)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "-20px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "200px",
            height: "200px",
            borderRadius: "50%",
            border: "1px solid rgba(6,182,212,0.08)",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
