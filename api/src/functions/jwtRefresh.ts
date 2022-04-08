import to from "await-to-js"
import jwt from "jsonwebtoken"
import { Account } from "@prisma/client"
import type { APIGatewayProxyEvent } from "aws-lambda"

import { db } from "src/lib/db"

export const handler = async (event: APIGatewayProxyEvent) => {
  // Preflight requests to this endpoint which say what a client is allowed to send
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "*",
      },
    }
  }

  let refreshToken: string | undefined = undefined

  // Gets refresh token from cookie, headers or body.
  if (!refreshToken) {
    refreshToken = event.headers["authorization"]?.replace("Bearer ", "")
  }

  if (!refreshToken)
    refreshToken = (event.headers.cookie || "").split(";").reduce((acc, el) => {
      const [k, v] = el.split("=")
      acc[k.trim()] = v
      return acc
    }, {} as any).refreshToken

  // For apps, respect sending the token in the body
  try {
    refreshToken = refreshToken || JSON.parse(event.body!).refreshToken
  } catch (error) {
    // noop
  }

  if (!refreshToken) return errStatus(400, "Could not find a refresh token in the cookie, headers nor request body")

  // Verifies if refresh token isnt expired. Throws if it is
  const [err, fromRefresh] = await to(verifyToken(refreshToken))
  if (!fromRefresh) return errStatus(400, "Could not verify refresh token")

  const { exp, userID, accountID } = fromRefresh
  if (err || exp * 1000 < Date.now()) return errStatus(400, "Refresh token is expired")

  // Compares refreshToken with the one stored on the db. Throws if they dont match
  const user = await db.user.findUnique({
    where: { id: userID },
    include: {
      account: true,
    },
  })

  if (!user) return errStatus(400, "Could not find a user which corresponds to that refresh token")

  let thisAccount: Account | undefined = undefined

  // Check if any of the associated accounts are the same as the one in the refresh token
  const jwts = await db.jWT.findMany({ where: { accountID } })
  for (const jwt of jwts) {
    if (jwt.id === refreshToken) thisAccount = user.account
  }

  if (!thisAccount) return errStatus(400, "Could not find an account which corresponds to that refresh token")
  const roles = user.roles

  // Generates new pair of tokens
  const accessToken = jwt.sign({ accountID, userID, roles }, process.env.TOKEN_SIGN_KEY!, {
    expiresIn: "30m",
  })

  const newRefreshToken = jwt.sign({ accountID, userID, roles }, process.env.TOKEN_SIGN_KEY!, {
    expiresIn: "1.5y",
  })

  // Remove the old one and add a new one

  await db.jWT.delete({ where: { id: refreshToken } })
  await db.jWT.create({ data: { id: newRefreshToken, accountID } })

  return {
    statusCode: 200,
    headers: {
      "set-cookie": [`refreshToken=${newRefreshToken}; Path=/; HttpOnly`],
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      refreshToken: newRefreshToken,
      accessToken,
      data: {
        userID,
        accountID,
        roles,
      },
    }),
  }
}

/**
 * Verifies if token is valid
 * @param {*} token
 */
const verifyToken = (token: string) =>
  new Promise<{ accountID: string; userID: string; roles: string; exp: number }>((resolve, reject) => {
    try {
      const decoded = jwt.verify(token, process.env.TOKEN_SIGN_KEY!) as any
      resolve(decoded)
    } catch (err) {
      reject(err)
    }
  })

const errStatus = (statusCode: number, reason: string) => ({
  statusCode,
  body: JSON.stringify({ reason }),
  headers: {
    "Access-Control-Allow-Origin": "*",
  },
})
