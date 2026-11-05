import "express"

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string
        role: "ADMIN" | "EMPLOYEE"
        restaurantId?: string
      }
    }
  }
}

export {}
