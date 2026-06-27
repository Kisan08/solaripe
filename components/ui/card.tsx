import type React from "react"
import { cn } from "@/lib/utils"

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "card-shadow rounded-[14px] border border-border bg-card",
        className,
      )}
      {...props}
    />
  )
}
