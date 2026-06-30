import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "musikkloss",
    short_name: "musikkloss",
    description:
      "Ein gesturstyrt musikkloss. Vri klossen, styr musikken. micro:bit V2 i ein 3D-printa kobolt-kropp.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f0e9",
    theme_color: "#f3f0e9",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  }
}
