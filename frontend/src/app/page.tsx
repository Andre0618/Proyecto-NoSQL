"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { getCurrentUser, getToken } from "@/lib/auth"

// con sesión entra a su pantalla; sin sesión, al login
export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const user = getCurrentUser()
    if (getToken() && user) {
      router.replace(user.role === "EMPLOYEE" ? "/tables" : "/dashboard")
    } else {
      router.replace("/login")
    }
  }, [router])

  return <div className="min-h-dvh bg-canvas" />
}
