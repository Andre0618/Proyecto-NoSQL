import axios from "axios"
import { endSession, getToken } from "@/lib/auth"

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/",
})

api.interceptors.request.use(config => {
  const token = getToken()
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// sesión vencida: al login en vez de dejar pantallas rotas
api.interceptors.response.use(
  response => response,
  error => {
    const status = error?.response?.status
    const url = String(error?.config?.url ?? "")
    if (status === 401 && !url.includes("auth/login") && typeof window !== "undefined") {
      endSession()
      if (window.location.pathname !== "/login") window.location.replace("/login")
    }
    return Promise.reject(error)
  }
)

export default api
