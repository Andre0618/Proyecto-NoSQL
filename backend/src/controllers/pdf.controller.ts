import { Request, Response } from "express";
import { sendError } from "../lib/errors"
import { prisma } from "../lib/prisma";
import PDFDocument from "pdfkit";

const col = (v: number) => `$${v.toLocaleString("es-CO")}`

const drawRow = (
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  color = "#333333",
  bold = false
) => {
  const y = doc.y
  doc
    .fontSize(11)
    .font(bold ? "Helvetica-Bold" : "Helvetica")
    .fillColor(color)
    .text(label, 50, y)
    .text(value, 350, y)
  doc.font("Helvetica").fillColor("#333333")
  // vuelve a la izquierda, si no el texto que sigue arranca corrido
  doc.x = 50
  doc.moveDown(0.35)
}

const drawDivider = (doc: PDFKit.PDFDocument, color = "#eeeeee") => {
  doc.moveDown(0.5)
  doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor(color).stroke()
  doc.moveDown(0.7)
}

type CashBox = { base: number; efectivo: number; compras: number; gastos: number; sueldos: number }

// Base + ventas en efectivo − compras, gastos y sueldos pagados en efectivo
const cashInBox = (v: CashBox) => v.base + v.efectivo - v.compras - v.gastos - v.sueldos

// Cierre de la caja: solo el efectivo. Lo pagado por Nequi o Bancolombia no sale de la caja.
const drawCashClose = (doc: PDFKit.PDFDocument, v: CashBox, title = "Cierre de caja (solo efectivo)") => {
  doc.fontSize(13).font("Helvetica-Bold").fillColor("#000000").text(title)
  doc.moveDown(0.4)
  drawRow(doc, "Base de caja",                 `+ ${col(v.base)}`,     "#3498db")
  drawRow(doc, "Ventas en efectivo",           `+ ${col(v.efectivo)}`, "#27ae60")
  drawRow(doc, "Compras pagadas en efectivo",  `- ${col(v.compras)}`,  "#e74c3c")
  drawRow(doc, "Gastos pagados en efectivo",   `- ${col(v.gastos)}`,   "#e74c3c")
  drawRow(doc, "Sueldos pagados en efectivo",  `- ${col(v.sueldos)}`,  "#8e44ad")
  drawRow(doc, "Efectivo en caja", col(cashInBox(v)), "#000000", true)
}

const drawFooter = (doc: PDFKit.PDFDocument) => {
  doc.moveDown(2)
  drawDivider(doc)
  doc.fontSize(9).font("Helvetica").fillColor("#aaaaaa")
    .text("Sistema desarrollado por @JuanCVO", { align: "center" })
  doc.fontSize(8).text(
    `Generado el ${new Date().toLocaleDateString("es-CO", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
      timeZone: "America/Bogota",
    })}`,
    { align: "center" }
  )
}

export const downloadTodayPDF = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.restaurantId as string
    // el último cierre, aunque sea de ayer
    const summary = await prisma.dailySummary.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
    })

    if (!summary) {
      return sendError(res, "NO_SUMMARY")
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } })
    const doc = new PDFDocument({ margin: 50 })

    const dateStr = summary.date.toLocaleDateString("es-CO", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: "America/Bogota",
    })

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename=cierre-${Date.now()}.pdf`)
    doc.pipe(res)

    // Encabezado
    doc.fontSize(22).font("Helvetica-Bold").text(restaurant?.name ?? "Restaurante", { align: "center" })
    doc.fontSize(12).font("Helvetica").fillColor("#666666").text("Cierre del día", { align: "center" })
    doc.fontSize(11).fillColor("#e67e22").text(dateStr, { align: "center" })
    doc.moveDown(1.5)

    // Ventas
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000000").text("Ventas del día")
    doc.moveDown(0.4)
    drawRow(doc, "Mesas cerradas",  `${summary.totalOrdenes}`)
    drawRow(doc, "Platos vendidos", `${summary.totalPlatos}`)
    drawRow(doc, "Efectivo",        col(summary.efectivo))
    drawRow(doc, "Bancolombia",     col(summary.bancolombia))
    drawRow(doc, "Nequi",           col(summary.nequi))
    const baseCajaPDF = summary.baseCaja ?? 0
    if (baseCajaPDF > 0) {
      drawRow(doc, "Base de caja", col(baseCajaPDF), "#3498db")
    }

    drawDivider(doc, "#dddddd")

    // Gastos y compras
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000000").text("Gastos y compras del día")
    doc.moveDown(0.4)
    const totalGastos  = summary.totalGastos ?? 0
    const totalCompras = summary.totalCompras ?? 0
    if (totalGastos > 0 || totalCompras > 0) {
      if (totalGastos > 0)  drawRow(doc, "Gastos (descontados)",  col(totalGastos),  "#e74c3c")
      if (totalCompras > 0) drawRow(doc, "Compras (descontadas)", col(totalCompras), "#e74c3c")
    } else {
      doc.fontSize(11).font("Helvetica").fillColor("#aaaaaa").text("  Sin gastos ni compras registrados")
      doc.moveDown(0.35)
    }

    drawDivider(doc, "#dddddd")

    // Pagos a empleados
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000000").text("Sueldos pagados del día")
    doc.moveDown(0.4)
    const totalPagosEmpleados = summary.totalPagosEmpleados ?? 0
    const sueldosEfectivo     = summary.sueldosEfectivo ?? 0
    if (totalPagosEmpleados > 0) {
      drawRow(doc, "Total sueldos (descontados)", col(totalPagosEmpleados), "#8e44ad")
      drawRow(doc, "   En efectivo (de la caja)", col(sueldosEfectivo))
      drawRow(doc, "   Por Nequi o Bancolombia",  col(Math.max(totalPagosEmpleados - sueldosEfectivo, 0)))
    } else {
      doc.fontSize(11).font("Helvetica").fillColor("#aaaaaa").text("  Sin sueldos registrados")
      doc.moveDown(0.35)
    }

    drawDivider(doc, "#dddddd")

    // Propinas: no son ingreso del restaurante
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000000").text("Propinas (no cuentan como ingreso)")
    doc.moveDown(0.4)
    const propCobradas   = summary.totalPropinas ?? 0
    const propEntregadas = summary.propinasEntregadas ?? 0
    drawRow(doc, "Cobradas",     col(propCobradas), "#27ae60")
    drawRow(doc, "Entregadas",   col(propEntregadas))
    if (propEntregadas > 0) {
      drawRow(doc, "   En efectivo (de la caja)", col(summary.propinasEntregadasEfectivo ?? 0))
    }
    drawRow(doc, "Por entregar", col(Math.max(propCobradas - propEntregadas, 0)), "#27ae60", true)

    drawDivider(doc, "#dddddd")

    // Resumen neto
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000000").text("Resumen neto")
    doc.moveDown(0.4)
    const ventasBrutas = summary.efectivo + summary.bancolombia + summary.nequi
    drawRow(doc, "Ventas brutas",          col(ventasBrutas))
    if (baseCajaPDF > 0) {
      drawRow(doc, "Base de caja",         `+ ${col(baseCajaPDF)}`, "#3498db")
    }
    drawRow(doc, "Gastos",                 `- ${col(totalGastos)}`, "#e74c3c")
    drawRow(doc, "Compras",                `- ${col(totalCompras)}`, "#e74c3c")
    drawRow(doc, "Sueldos",                `- ${col(totalPagosEmpleados)}`, "#8e44ad")
    drawRow(doc, "Neto del día",           col(summary.totalIngresos), "#27ae60", true)

    drawDivider(doc, "#dddddd")

    drawCashClose(doc, {
      base: baseCajaPDF,
      efectivo: summary.efectivo,
      compras: summary.comprasEfectivo ?? 0,
      gastos: summary.gastosEfectivo ?? 0,
      sueldos: sueldosEfectivo,
    })

    drawFooter(doc)
    doc.end()
  } catch (error) {
    console.error(error)
    if (res.headersSent) return res.end()
    return sendError(res, "PDF_FAILED")
  }
}

// Reporte completo: todos los cierres más el detalle de compras, gastos y pagos.
// Es lo que después se puede reiniciar; X-Report-Until dice hasta dónde llega.
export const downloadSummaryPDF = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.restaurantId as string

    const summaries = await prisma.dailySummary.findMany({
      where: { restaurantId },
      orderBy: { date: "asc" },
    })

    if (summaries.length === 0) {
      return sendError(res, "NO_CLOSINGS")
    }

    const until = new Date(Math.max(...summaries.map(s => s.createdAt.getTime())))

    const [restaurant, movements, payments] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId } }),
      prisma.cashMovement.findMany({
        where: { restaurantId, createdAt: { lte: until } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.employeePayment.findMany({
        where: { restaurantId, createdAt: { lte: until } },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { name: true } } },
      }),
    ])

    const doc = new PDFDocument({ margin: 50 })

    const fmtDate = (d: Date) =>
      d.toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Bogota" })
    const fmtShort = (d: Date) =>
      d.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" })

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename=reporte-${Date.now()}.pdf`)
    res.setHeader("X-Report-Until", until.toISOString())
    doc.pipe(res)

    // Encabezado
    doc.fontSize(22).font("Helvetica-Bold").text(restaurant?.name ?? "Restaurante", { align: "center" })
    doc.fontSize(12).font("Helvetica").fillColor("#666666").text("Reporte de cierres", { align: "center" })
    doc.fontSize(10).text(
      `Del ${summaries[0].date.toLocaleDateString("es-CO", { timeZone: "America/Bogota" })} al ${summaries[summaries.length - 1].date.toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}`,
      { align: "center" }
    )
    doc.moveDown(1.5)

    // Totales generales
    const totalIngresos       = summaries.reduce((s, d) => s + d.totalIngresos, 0)
    const totalOrdenes        = summaries.reduce((s, d) => s + d.totalOrdenes, 0)
    const totalEfectivo       = summaries.reduce((s, d) => s + d.efectivo, 0)
    const totalBancolombia    = summaries.reduce((s, d) => s + d.bancolombia, 0)
    const totalComprasEf      = summaries.reduce((s, d) => s + (d.comprasEfectivo ?? 0), 0)
    const totalGastosEf       = summaries.reduce((s, d) => s + (d.gastosEfectivo ?? 0), 0)
    const totalNequi          = summaries.reduce((s, d) => s + d.nequi, 0)
    const totalPropinas       = summaries.reduce((s, d) => s + (d.totalPropinas ?? 0), 0)
    const totalGastos         = summaries.reduce((s, d) => s + (d.totalGastos ?? 0), 0)
    const totalCompras        = summaries.reduce((s, d) => s + (d.totalCompras ?? 0), 0)
    const totalPagosEmpleados = summaries.reduce((s, d) => s + (d.totalPagosEmpleados ?? 0), 0)
    const totalSueldosEf      = summaries.reduce((s, d) => s + (d.sueldosEfectivo ?? 0), 0)
    const totalBase           = summaries.reduce((s, d) => s + (d.baseCaja ?? 0), 0)
    const ventasBrutas        = totalEfectivo + totalBancolombia + totalNequi

    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000000").text("Resumen general")
    doc.moveDown(0.4)
    drawRow(doc, "Días cerrados",          `${summaries.length}`)
    drawRow(doc, "Total órdenes",          `${totalOrdenes}`)
    drawRow(doc, "Efectivo",               col(totalEfectivo))
    drawRow(doc, "Bancolombia",            col(totalBancolombia))
    drawRow(doc, "Nequi",                  col(totalNequi))
    drawRow(doc, "Ventas brutas",          col(ventasBrutas))
    drawRow(doc, "Base de caja",           `+ ${col(totalBase)}`, "#3498db")
    drawRow(doc, "Gastos",                 `- ${col(totalGastos)}`, "#e74c3c")
    drawRow(doc, "Compras",                `- ${col(totalCompras)}`, "#e74c3c")
    drawRow(doc, "Sueldos",                `- ${col(totalPagosEmpleados)}`, "#8e44ad")
    drawRow(doc, "Neto total",             col(totalIngresos), "#27ae60", true)
    doc.moveDown(0.3)
    drawRow(doc, "Propinas cobradas",      col(totalPropinas), "#27ae60")

    drawDivider(doc, "#cccccc")

    drawCashClose(doc, { base: totalBase, efectivo: totalEfectivo, compras: totalComprasEf, gastos: totalGastosEf, sueldos: totalSueldosEf })

    drawDivider(doc, "#cccccc")

    // Detalle por día
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000000").text("Detalle por día")
    doc.moveDown(0.6)

    for (const summary of summaries) {
      const gastosDia   = summary.totalGastos ?? 0
      const comprasDia  = summary.totalCompras ?? 0
      const pagosDia    = summary.totalPagosEmpleados ?? 0
      const baseCajaDia = summary.baseCaja ?? 0
      const ventasDia   = summary.efectivo + summary.bancolombia + summary.nequi
      const cajaDia     = cashInBox({
        base: baseCajaDia,
        efectivo: summary.efectivo,
        compras: summary.comprasEfectivo ?? 0,
        gastos: summary.gastosEfectivo ?? 0,
        sueldos: summary.sueldosEfectivo ?? 0,
      })

      doc.fontSize(11).font("Helvetica-Bold").fillColor("#e67e22").text(fmtDate(summary.date))
      doc.fontSize(10).font("Helvetica").fillColor("#333333")
        .text(`  Ventas: ${col(ventasDia)}   |   Órdenes: ${summary.totalOrdenes}   |   Platos: ${summary.totalPlatos}`)
      doc.text(`  Efectivo: ${col(summary.efectivo)}   |   Bancolombia: ${col(summary.bancolombia)}   |   Nequi: ${col(summary.nequi)}`)
      doc.text(`  Efectivo en caja: ${col(cajaDia)}`)
      doc.fillColor("#27ae60").text(`  Propinas: ${col(summary.totalPropinas ?? 0)}`)
      if (baseCajaDia > 0) doc.fillColor("#3498db").text(`  Base de caja: ${col(baseCajaDia)}`)
      if (gastosDia > 0)   doc.fillColor("#e74c3c").text(`  Gastos: ${col(gastosDia)}`)
      if (comprasDia > 0)  doc.fillColor("#e74c3c").text(`  Compras: ${col(comprasDia)}`)
      if (pagosDia > 0)    doc.fillColor("#8e44ad").text(`  Sueldos: ${col(pagosDia)}`)
      doc.fillColor("#27ae60").font("Helvetica-Bold")
        .text(`  Neto del día: ${col(summary.totalIngresos)}`)
      doc.font("Helvetica").fillColor("#333333")
      doc.moveDown(0.9)
    }

    // Detalle de compras y gastos
    drawDivider(doc, "#cccccc")
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000000").text("Detalle de compras, gastos y base de caja")
    doc.moveDown(0.5)
    if (movements.length === 0) {
      doc.fontSize(10).font("Helvetica").fillColor("#aaaaaa").text("  Sin movimientos registrados")
    }
    const typeLabel = { COMPRA: "Compra", GASTO: "Gasto", BASE_CAJA: "Base de caja" } as const
    for (const m of movements) {
      const extra = [m.paymentMethod, m.notes].filter(Boolean).join(" · ")
      doc.fontSize(10).font("Helvetica").fillColor("#333333")
        .text(`${fmtShort(m.createdAt)}   ${typeLabel[m.type]}   ${m.concept}   ${col(m.amount)}${extra ? `   (${extra})` : ""}`)
    }

    // Detalle de pagos a empleados
    drawDivider(doc, "#cccccc")
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000000").text("Detalle de sueldos y propinas entregadas")
    doc.moveDown(0.5)
    if (payments.length === 0) {
      doc.fontSize(10).font("Helvetica").fillColor("#aaaaaa").text("  Sin pagos registrados")
    }
    for (const p of payments) {
      doc.fontSize(10).font("Helvetica").fillColor("#333333")
        .text(`${fmtShort(p.createdAt)}   ${p.user.name}   Sueldo: ${col(p.salary)}${p.tip > 0 ? `   Propina: ${col(p.tip)}` : ""}   ${p.paymentMethod}${p.notes ? `   (${p.notes})` : ""}`)
    }

    drawFooter(doc)
    doc.end()
  } catch (error) {
    console.error(error)
    if (res.headersSent) return res.end()
    return sendError(res, "PDF_FAILED")
  }
}
