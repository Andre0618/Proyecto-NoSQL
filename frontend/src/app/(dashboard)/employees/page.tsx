"use client"

import { useCallback, useEffect, useState } from "react"
import { KeyRound, Plus, Shield, Trash2, UserCheck } from "lucide-react"

import api from "@/lib/axios"
import { getCurrentUser, setSession, useCurrentUser } from "@/lib/auth"
import { apiMessage } from "@/lib/errors"
import { shortDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Employee } from "@/types/api"
import TopBar from "@/components/ui/layout/TopBar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Field, Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { useToast } from "@/components/ui/toast"

export default function EmployeesPage() {
  const toast = useToast()
  const { restaurantId } = useCurrentUser()

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [pwTarget, setPwTarget] = useState<Employee | null>(null)
  const [pwValue, setPwValue] = useState("")
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState("")

  const [ownOpen, setOwnOpen] = useState(false)
  const [ownCurrent, setOwnCurrent] = useState("")
  const [ownNew, setOwnNew] = useState("")
  const [ownSaving, setOwnSaving] = useState(false)
  const [ownError, setOwnError] = useState("")

  const fetchEmployees = useCallback(async () => {
    if (!restaurantId) return
    try {
      const res = await api.get(`/auth/users/${restaurantId}`)
      setEmployees(res.data)
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo cargar la lista de usuarios."))
    } finally {
      setLoading(false)
    }
  }, [restaurantId, toast])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  const openForm = () => {
    setName(""); setEmail(""); setPassword(""); setFormError("")
    setFormOpen(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password.trim()) return
    if (password.length < 8) {
      setFormError("La contraseña debe tener al menos 8 caracteres.")
      return
    }
    setSaving(true)
    setFormError("")
    try {
      await api.post("/auth/employees", { name: name.trim(), email: email.trim(), password })
      setFormOpen(false)
      toast.success(`${name.trim()} ya puede iniciar sesión.`)
      await fetchEmployees()
    } catch (err) {
      setFormError(apiMessage(err, "No se pudo crear el empleado."))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await api.delete(`/auth/users/${deleteTarget.id}`)
      setEmployees(prev => prev.filter(e => e.id !== deleteTarget.id))
      toast.success(res.data?.message ?? "Empleado eliminado.")
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo eliminar al empleado."))
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwTarget) return
    if (pwValue.length < 8) { setPwError("La contraseña debe tener al menos 8 caracteres."); return }
    setPwSaving(true)
    setPwError("")
    try {
      await api.patch(`/auth/users/${pwTarget.id}/password`, { password: pwValue })
      toast.success(`Contraseña de ${pwTarget.name} actualizada.`)
      setPwTarget(null)
      setPwValue("")
    } catch (err) {
      setPwError(apiMessage(err, "No se pudo cambiar la contraseña."))
    } finally {
      setPwSaving(false)
    }
  }

  const handleOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (ownNew.length < 8) { setOwnError("La contraseña nueva debe tener al menos 8 caracteres."); return }
    setOwnSaving(true)
    setOwnError("")
    try {
      const { data } = await api.patch("/auth/password", { currentPassword: ownCurrent, newPassword: ownNew })
      // al cambiar la clave se cierran las demás sesiones; esta sigue con el token nuevo
      const me = getCurrentUser()
      if (data?.token && me) setSession(data.token, me)
      toast.success("Tu contraseña se actualizó.")
      setOwnOpen(false)
      setOwnCurrent("")
      setOwnNew("")
    } catch (err) {
      setOwnError(apiMessage(err, "No se pudo cambiar la contraseña."))
    } finally {
      setOwnSaving(false)
    }
  }

  const admins = employees.filter(e => e.role === "ADMIN").length
  const waiters = employees.length - admins

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="Empleados">
        <Button variant="secondary" onClick={() => { setOwnCurrent(""); setOwnNew(""); setOwnError(""); setOwnOpen(true) }} aria-label="Mi contraseña">
          <KeyRound size={17} /> <span className="max-md:hidden">Mi contraseña</span>
        </Button>
        <Button onClick={openForm}>
          <Plus size={17} /> <span className="max-sm:hidden">Agregar empleado</span><span className="sm:hidden">Agregar</span>
        </Button>
      </TopBar>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-2 md:px-7">
        <p className="mb-4 text-soft">
          <span className="font-semibold text-ink tnum">{employees.length}</span> {employees.length === 1 ? "usuario" : "usuarios"} en el restaurante
          {" · "}
          <span className="inline-flex items-center gap-1"><Shield size={14} className="text-hot" /> {admins} {admins === 1 ? "administrador" : "administradores"}</span>
          {" · "}
          <span className="inline-flex items-center gap-1"><UserCheck size={14} className="text-brand" /> {waiters} {waiters === 1 ? "empleado" : "empleados"}</span>
        </p>

        <section className="rounded-lg bg-surface">
          {loading ? (
            <div className="flex flex-col gap-px p-2" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-md bg-surface-2/50" />)}
            </div>
          ) : employees.length === 0 ? (
            <p className="px-6 py-12 text-center text-soft">Todavía no hay usuarios. Agrega al primer empleado.</p>
          ) : (
            <ul>
              {employees.map(emp => {
                const isAdmin = emp.role === "ADMIN"
                return (
                  <li key={emp.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-0 sm:px-5">
                    <span className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full font-display font-bold",
                      isAdmin ? "bg-hot text-hot-ink" : "bg-brand text-brand-ink"
                    )}>
                      {emp.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{emp.name}</p>
                      <p className="truncate text-sm text-soft">{emp.email}</p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <Badge tone={isAdmin ? "hot" : "brand"}>{isAdmin ? "Administrador" : "Empleado"}</Badge>
                      <p className="mt-1 text-sm text-soft">Desde {shortDate(emp.createdAt)}</p>
                    </div>
                    {!isAdmin ? (
                      <div className="flex shrink-0">
                        <button
                          onClick={() => { setPwTarget(emp); setPwValue(""); setPwError("") }}
                          aria-label={`Cambiar la contraseña de ${emp.name}`}
                          className="grid size-10 place-items-center rounded-md text-faint transition-colors hover:bg-brand/15 hover:text-brand"
                        >
                          <KeyRound size={17} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(emp)}
                          aria-label={`Eliminar empleado ${emp.name}`}
                          className="grid size-10 place-items-center rounded-md text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    ) : (
                      <span className="w-20 shrink-0" aria-hidden />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title="Nuevo empleado" size="sm" dismissible={!saving}>
        <form onSubmit={handleCreate} className="flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
          <Field label="Nombre completo">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Juan García" required autoComplete="off" />
          </Field>
          <Field label="Correo">
            <Input type="email" inputMode="email" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@restaurante.com" required autoComplete="off" />
          </Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres">
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required minLength={8} autoComplete="new-password" />
          </Field>

          {formError && <p role="alert" className="rounded-md bg-bad/10 px-3 py-2.5 text-[15px] text-bad">{formError}</p>}

          <div className="flex gap-2.5 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" className="flex-1" loading={saving}>{saving ? "Creando..." : "Crear empleado"}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={pwTarget !== null}
        onClose={() => !pwSaving && setPwTarget(null)}
        title={pwTarget ? `Contraseña de ${pwTarget.name}` : "Contraseña"}
        size="sm"
        dismissible={!pwSaving}
      >
        <form onSubmit={handleResetPassword} className="flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
          <Field label="Contraseña nueva" hint="Mínimo 8 caracteres. Entrégasela al empleado; puede seguir usándola tal cual.">
            <Input type="password" value={pwValue} onChange={e => setPwValue(e.target.value)} required minLength={8} autoComplete="new-password" />
          </Field>
          {pwError && <p role="alert" className="rounded-md bg-bad/10 px-3 py-2.5 text-[15px] text-bad">{pwError}</p>}
          <div className="flex gap-2.5">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setPwTarget(null)} disabled={pwSaving}>Cancelar</Button>
            <Button type="submit" className="flex-1" loading={pwSaving}>Guardar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={ownOpen} onClose={() => !ownSaving && setOwnOpen(false)} title="Mi contraseña" size="sm" dismissible={!ownSaving}>
        <form onSubmit={handleOwnPassword} className="flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
          <Field label="Contraseña actual">
            <Input type="password" value={ownCurrent} onChange={e => setOwnCurrent(e.target.value)} required autoComplete="current-password" />
          </Field>
          <Field label="Contraseña nueva" hint="Mínimo 8 caracteres">
            <Input type="password" value={ownNew} onChange={e => setOwnNew(e.target.value)} required minLength={8} autoComplete="new-password" />
          </Field>
          {ownError && <p role="alert" className="rounded-md bg-bad/10 px-3 py-2.5 text-[15px] text-bad">{ownError}</p>}
          <div className="flex gap-2.5">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setOwnOpen(false)} disabled={ownSaving}>Cancelar</Button>
            <Button type="submit" className="flex-1" loading={ownSaving}>Guardar</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="¿Eliminar empleado?"
        message={deleteTarget ? <>Vas a eliminar a <strong className="text-ink">{deleteTarget.name}</strong>. Si ya tiene órdenes o pagos, se desactiva: deja de poder entrar y su historial se conserva.</> : ""}
        confirmLabel="Sí, eliminar"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
