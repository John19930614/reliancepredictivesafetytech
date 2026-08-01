import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Home-screen icon for the installable app. iOS does not apply its own rounded
 * mask corners to Web App icons the way it does to App Store apps, so the
 * artwork fills the square and the OS handles the corner radius.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(150deg, #1c1c1c 0%, #070707 55%, #000000 100%)",
        }}
      >
        <div
          style={{
            width: 128,
            height: 128,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 34,
            background: "linear-gradient(150deg, #f0c86a 0%, #c9932b 100%)",
            color: "#070707",
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          RPST
        </div>
      </div>
    ),
    size,
  );
}
