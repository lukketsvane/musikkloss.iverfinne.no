import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default async function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f3f0e9",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            margin: "auto",
            background: "#1754b8",
            borderRadius: "44px",
          }}
        />
      </div>
    ),
    { ...size }
  )
}
