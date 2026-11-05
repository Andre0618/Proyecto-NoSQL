"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"

import api from "@/lib/axios"
import { apiMessage } from "@/lib/errors"
import { authHeaders } from "@/lib/auth"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

type CloseState = "idle" | "loading" | "success" | "error"

export const OPEN_CLOSE_DAY_EVENT = "open-close-day"

const triggerBlobDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const todayStamp = () => new Date().toLocaleDateString("es-CO").replace(/\//g, "-")

// Cierre del día y reporte. Viven aquí porque los dispara el menú, "Más" y el dashboard.
export function useDayActions(restaurantId: string) {
  const router = useRouter()
  const toast = useToast()

  const [showClose, setShowClose] = useState(false)
  const [closeState, setCloseState] = useState<CloseState>("idle")
  const [closeMsg, setCloseMsg] = useState("")
  const [showPdf, setShowPdf] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  // hasta dónde llega el reporte descargado; con eso se ofrece reiniciar
  const [reportUntil, setReportUntil] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  const openClose = useCallback(() => setShowClose(true), [])
  const openPdf = useCallback(() => setShowPdf(true), [])

  useEffect(() => {
    window.addEventListener(OPEN_CLOSE_DAY_EVENT, openClose)
    return () => window.removeEventListener(OPEN_CLOSE_DAY_EVENT, openClose)
  }, [openClose])

  const handleCloseDay = async () => {
    if (!restaurantId) return
    setCloseState("loading")
    setCloseMsg("")

    try {
      await api.post("/daily-summary/close", { restaurantId }, { headers: authHeaders() })
      setCloseState("success")
      setCloseMsg("El día se cerró correctamente. Las órdenes fueron archivadas.")
      window.dispatchEvent(new Event("day-closed"))

      try {
        const pdfRes = await api.get(`/daily-summary/pdf/day/${restaurantId}`, {
          headers: authHeaders(),
          responseType: "blob",
        })
        triggerBlobDownload(new Blob([pdfRes.data], { type: "application/pdf" }), `cierre-${todayStamp()}.pdf`)
      } catch {
        // si el PDF falla, el cierre ya quedó hecho
      }
    } catch (err) {
      setCloseState("error")
      setCloseMsg(apiMessage(err, "Error al cerrar el día."))
    }
  }

  const dismissClose = () => {
    const wasSuccess = closeState === "success"
    setShowClose(false)
    setCloseState("idle")
    setCloseMsg("")
    if (wasSuccess) router.refresh()
  }

  // el PDF es el respaldo de lo que luego se puede reiniciar
  const handleDownloadPdf = async () => {
    if (!restaurantId || pdfLoading) return
    setShowPdf(false)
    setPdfLoading(true)
    try {
      const res = await api.get(`/daily-summary/pdf/${restaurantId}`, {
        headers: authHeaders(),
        responseType: "blob",
      })
      triggerBlobDownload(new Blob([res.data], { type: "application/pdf" }), `reporte-${todayStamp()}.pdf`)
      const until = res.headers["x-report-until"]
      if (until) setReportUntil(String(until))
      else toast.success("Reporte descargado.")
    } catch {
      toast.error("No se pudo descargar el reporte. Cierra al menos un día e intenta de nuevo.")
    } finally {
      setPdfLoading(false)
    }
  }

  // borra solo lo que trae el PDF, no lo posterior al último cierre
  const handleReset = async () => {
    if (!restaurantId || !reportUntil || resetting) return
    setResetting(true)
    try {
      await api.delete(`/daily-summary/${restaurantId}`, { headers: authHeaders(), params: { until: reportUntil } })
      setReportUntil(null)
      toast.success("Historial reiniciado. El reporte quedó en tus descargas.")
      window.dispatchEvent(new Event("day-closed"))
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo reiniciar el historial. El reporte sí se descargó."))
    } finally {
      setResetting(false)
    }
  }

  const modals = (
    <>
      <Modal
        open={showClose}
        onClose={dismissClose}
        title="Cerrar día"
        size="sm"
        dismissible={closeState !== "loading"}
      >
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {closeState === "idle" && (
            <div className="flex flex-col gap-4">
              <p className="text-[15px] leading-relaxed text-soft">
                Se archivan las órdenes cerradas de hoy y se guarda el resumen del día con sus cuentas.{" "}
                <strong className="font-semibold text-ink">No se puede deshacer.</strong>
              </p>
              <p className="rounded-md bg-warn/10 px-3 py-2.5 text-sm text-warn">
                Antes de continuar, cierra todas las cuentas abiertas.
              </p>
              <div className="flex gap-2.5">
                <Button variant="secondary" className="flex-1" onClick={dismissClose}>Cancelar</Button>
                <Button variant="hot" className="flex-1" onClick={handleCloseDay}>Sí, cerrar día</Button>
              </div>
            </div>
          )}

          {closeState === "loading" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={34} className="animate-spin text-hot" aria-hidden />
              <p className="text-soft">Cerrando el día...</p>
            </div>
          )}

          {closeState === "success" && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <CheckCircle2 size={40} className="text-good" aria-hidden />
              <p className="font-display text-lg font-bold text-good">Día cerrado</p>
              <p className="text-sm text-soft">{closeMsg}</p>
              <Button variant="success" className="mt-2 w-full" onClick={dismissClose}>Entendido</Button>
            </div>
          )}

          {closeState === "error" && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <AlertCircle size={40} className="text-bad" aria-hidden />
              <p className="font-display text-lg font-bold text-bad">No se pudo cerrar el día</p>
              <p className="text-sm text-soft">{closeMsg}</p>
              <div className="mt-2 flex w-full gap-2.5">
                <Button variant="secondary" className="flex-1" onClick={dismissClose}>Cancelar</Button>
                <Button variant="danger" className="flex-1" onClick={handleCloseDay}>Reintentar</Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={showPdf} onClose={() => setShowPdf(false)} title="Descargar reporte" size="sm">
        <div className="flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
          <p className="text-[15px] leading-relaxed text-soft">
            Se descarga un PDF con todos los cierres guardados y el detalle de compras, gastos, sueldos y propinas.
          </p>
          <p className="rounded-md bg-warn/10 px-3 py-2.5 text-sm text-warn">
            Después te preguntamos si quieres reiniciar el historial. El PDF será el único respaldo.
          </p>
          <div className="flex gap-2.5">
            <Button variant="secondary" className="flex-1" onClick={() => setShowPdf(false)}>Cancelar</Button>
            <Button variant="primary" className="flex-1" onClick={handleDownloadPdf}>Descargar</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={reportUntil !== null}
        onClose={() => setReportUntil(null)}
        title="¿Reiniciar el historial?"
        size="sm"
        dismissible={!resetting}
      >
        <div className="flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
          <p className="text-[15px] leading-relaxed text-soft">
            Revisa que el PDF esté en tus descargas y que abra bien. Si continúas se borra todo lo que contiene:
            los cierres, las compras, los gastos, los pagos y las órdenes archivadas.{" "}
            <strong className="font-semibold text-ink">No se puede deshacer.</strong>
          </p>
          <div className="flex gap-2.5">
            <Button variant="secondary" className="flex-1" onClick={() => setReportUntil(null)} disabled={resetting}>
              No, conservar
            </Button>
            <Button variant="danger" className="flex-1" onClick={handleReset} loading={resetting}>
              Sí, reiniciar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )

  return { openClose, openPdf, pdfLoading, modals }
}
