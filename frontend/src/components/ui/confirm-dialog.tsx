"use client"

import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"

type ConfirmDialogProps = {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: "danger" | "primary"
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, message, confirmLabel = "Confirmar", cancelLabel = "Cancelar",
  tone = "danger", loading = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm" dismissible={!loading}>
      <div className="flex flex-col gap-5 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="text-[15px] leading-relaxed text-soft">{message}</div>
        <div className="flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} className="flex-1" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
