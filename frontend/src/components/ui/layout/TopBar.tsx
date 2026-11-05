"use client"

import Image from "next/image"

import { useCurrentUser } from "@/lib/auth"
import { longDate } from "@/lib/format"
import StockBell from "@/components/ui/layout/StockBell"

export default function TopBar({ title, children }: { title: string; children?: React.ReactNode }) {
  const { user, restaurantId } = useCurrentUser()
  return (
    <header className="sticky top-0 z-30 flex shrink-0 items-center gap-3 bg-canvas/90 px-4 py-3 backdrop-blur md:px-7 md:py-4">
      <div className="rounded-lg bg-plate p-0.5 md:hidden">
        <Image src="/LogoRestaurantOS.png" alt="RestaurantOS" width={581} height={152} className="size-8 object-cover object-left" />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl font-bold leading-tight md:text-2xl">{title}</h1>
        <p suppressHydrationWarning className="hidden truncate text-sm first-letter:uppercase text-soft sm:block">{longDate()}</p>
      </div>

      {children}
      {user?.role === "ADMIN" && <StockBell restaurantId={restaurantId} />}
    </header>
  )
}
