import type { Prisma } from "@prisma/client"
import type { ResolverArgs } from "@redwoodjs/graphql-server"
import jwt from "jsonwebtoken"

import { db } from "src/lib/db"

export const accounts = () => {
  return db.account.findMany()
}

export const account = ({ id }: Prisma.AccountWhereUniqueInput) => {
  return db.account.findUnique({
    where: { id },
  })
}

export const usersOnAnAccount = (input) => {
  try {
    const response = jwt.verify(input.jwt, process.env.TOKEN_SIGN_KEY!, { complete: true })
    if (typeof response.payload === "string") {
      return []
    }

    const { accountID, use } = response.payload
    if (use !== "usersOnAnAccount") return []

    return db.account.findUnique({ where: { id: accountID } }).users()
  } catch (error) {
    return []
  }
}

export const Account = {
  users: (_obj, { root }: ResolverArgs<ReturnType<typeof account>>) => db.account.findUnique({ where: { id: root.id } }).users(),
  jwts: (_obj, { root }: ResolverArgs<ReturnType<typeof account>>) => db.account.findUnique({ where: { id: root.id } }).jwts(),
}
