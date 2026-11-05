"use client"

import { useMemo, useSyncExternalStore } from "react"
import type { CurrentUser } from "@/types/api"

const USER_KEY  = "user"
const TOKEN_KEY = "token"

// "storage" solo avisa desde otras pestañas; esto avisa en la misma
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

const subscribe = (callback: () => void) => {
  listeners.add(callback)
  window.addEventListener("storage", callback)
  return () => {
    listeners.delete(callback)
    window.removeEventListener("storage", callback)
  }
}

const safeGet = (key: string): string | null => {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const parseUser = (raw: string | null): CurrentUser | null => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as CurrentUser
  } catch {
    return null
  }
}

export const getCurrentUser = (): CurrentUser | null => parseUser(safeGet(USER_KEY))

export const getToken = (): string | null => safeGet(TOKEN_KEY)

export const setSession = (token: string, user: CurrentUser) => {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  emit()
}

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  emit()
}

// El token trae su vencimiento (campo exp, en segundos). Aquí solo se lee para cerrar la sesión a tiempo;
// quien de verdad valida la firma y el vencimiento es el servidor.
export const tokenExpiresAt = (token: string | null): number | null => {
  if (!token) return null
  try {
    const payload = token.split(".")[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "="))
    const exp = (JSON.parse(json) as { exp?: unknown }).exp
    return typeof exp === "number" ? exp * 1000 : null
  } catch {
    return null
  }
}

export const isSessionExpired = (token: string | null) => {
  const at = tokenExpiresAt(token)
  return at !== null && Date.now() >= at
}

// el login lo lee para explicar por qué se volvió a pedir la contraseña
export const SESSION_NOTICE_KEY = "session-notice"
export const SESSION_ENDED_MESSAGE = "Tu sesión venció. Inicia sesión de nuevo."

export const endSession = () => {
  try { sessionStorage.setItem(SESSION_NOTICE_KEY, SESSION_ENDED_MESSAGE) } catch { /* sin aviso, igual se cierra */ }
  clearSession()
}

export const authHeaders = () => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const noopSubscribe = () => () => {}

export const useCurrentUser = () => {
  const rawUser = useSyncExternalStore(subscribe, () => safeGet(USER_KEY), () => null)
  const token   = useSyncExternalStore(subscribe, () => safeGet(TOKEN_KEY), () => null)
  // false en el servidor y al hidratar; true ya en el navegador
  const ready   = useSyncExternalStore(noopSubscribe, () => true, () => false)

  const user = useMemo(() => parseUser(rawUser), [rawUser])

  return { user, token, ready, restaurantId: user?.restaurantId ?? "" }
}
