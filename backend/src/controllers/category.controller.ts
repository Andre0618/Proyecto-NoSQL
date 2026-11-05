import { Request, Response } from "express"
import { HTTP } from "../lib/errors"
import { prisma } from "../lib/prisma"
import { CategorySchema } from "../lib/validators"
import { asyncHandler } from "../lib/asyncHandler"

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string
  const categories = await prisma.category.findMany({
    where: { restaurantId },
    orderBy: { name: "asc" },
  })
  return res.json(categories)
})

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const data = CategorySchema.parse(req.body)
  const category = await prisma.category.create({ data })
  return res.status(HTTP.CREATED).json(category)
})

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  await prisma.category.delete({ where: { id } })
  return res.json({ message: "Categoría eliminada" })
})
