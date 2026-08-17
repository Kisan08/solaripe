import type { Metadata } from "next"
import { LandingPage } from "@/components/landing/LandingPage"

export const metadata: Metadata = {
  title: "Amsu — Run Your Solar EPC Business From One Platform",
  description:
    "Amsu is the all-in-one operating platform for Indian solar EPC companies — 3D rooftop design, AI quotes, leads CRM, and AI-assisted calling in Hindi and Hinglish.",
}

export default function Page() {
  return <LandingPage />
}
