type ApiErrorShape = {
  response?: { data?: { message?: string; available?: number } }
  request?: unknown
}

export const apiMessage = (err: unknown, fallback: string): string => {
  const e = err as ApiErrorShape
  const data = e?.response?.data
  if (data?.message) {
    return typeof data.available === "number"
      ? `${data.message} Quedan ${data.available}.`
      : data.message
  }
  if (e?.request && !e?.response) return "No hay conexión con el servidor. Revisa tu internet."
  return fallback
}
