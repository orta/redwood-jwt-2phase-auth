import type { Prisma } from "@prisma/client"
import cuid from "cuid"

import { db } from "src/lib/db"

export const users = () => {
  return db.user.findMany()
}

export const user = ({ id }: Prisma.UserWhereUniqueInput) => {
  return db.user.findUnique({
    where: { id },
  })
}

interface CreateUserArgs {
  input: Prisma.UserCreateInput
}

export const createUser = ({ input }: CreateUserArgs) => {
  return db.user.create({
    data: input,
  })
}

interface UpdateUserArgs extends Prisma.UserWhereUniqueInput {
  input: Prisma.UserUpdateInput
}

export const updateUser = ({ id, input }: UpdateUserArgs) => {
  return db.user.update({
    data: input,
    where: { id },
  })
}

export const deleteUser = ({ id }: Prisma.UserWhereUniqueInput) => {
  return db.user.delete({
    where: { id },
  })
}

export const createNewUserOnAccount = async (args) => {
  if (!context.currentUser) return undefined

  const username = await canUseHandle(args.input.username)
  if (!username) {
    return undefined
  }

  return db.user.create({
    data: {
      id: cuid() + ":user",
      username,
      roles: context.currentUser.roles,
      account: {
        connect: context.currentUser.account,
      },
    },
  })
}

export const slugify = (text: string) =>
  text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")

export const canUseHandle = async (handle: string) => {
  const handleSlug = slugify(handle)
  const exists = await db.user.findUnique({ where: { username: handleSlug } })
  if (exists) return undefined

  return handleSlug
}
