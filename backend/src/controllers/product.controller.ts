import { Request, Response } from "express"
import { prisma } from "../lib/prisma"
import { ProductSchema, ProductUpdateSchema } from "../lib/validators"
import { asyncHandler } from "../lib/asyncHandler"
import { BusinessError, HTTP } from "../lib/errors"
import { audit } from "../lib/audit"

const assertCategoryBelongsTo = async (categoryId: string, restaurantId?: string) => {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { restaurantId: true } })
  if (!category || category.restaurantId !== restaurantId) throw new BusinessError("FORBIDDEN")
}

export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string
  const products = await prisma.product.findMany({
    where: { restaurantId },
    include: { category: true },
    orderBy: { name: "asc" },
  })
  return res.json(products)
})

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const data = ProductSchema.parse(req.body)
  await assertCategoryBelongsTo(data.categoryId, data.restaurantId)
  const product = await prisma.product.create({ data, include: { category: true } })
  return res.status(HTTP.CREATED).json(product)
})

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  const data = ProductUpdateSchema.parse(req.body)
  if (data.categoryId) await assertCategoryBelongsTo(data.categoryId, req.user?.restaurantId)
  const product = await prisma.product.update({
    where: { id },
    data,
    include: { category: true },
  })
  return res.json(product)
})

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  await prisma.product.delete({ where: { id } })
  audit(req, "product.delete", { productId: id })
  return res.json({ message: "Producto eliminado" })
})
