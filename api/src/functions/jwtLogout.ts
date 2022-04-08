import to from "await-to-js"
import jwt from "jsonwebtoken"
import type { APIGatewayProxyEvent, Context as LambdaContext } from "aws-lambda"

import { db } from "src/lib/db"

export const handler = async (event: APIGatewayProxyEvent, _context: LambdaContext) => {
  // Preflight requests to this endpoint which say what a client is allowed to send
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "*",
      },
    }
  }
  const { token } = JSON.parse(event.body!)

  // Removes refresh token from user db entry, if provided token is valid
  const [err, data] = await to(verifyToken(token))
  if (!data) return errStatus(400, `Could not extract token from JWT`)
  if (err) return errStatus(400, `JWT is not valid`)

  const accountID = data.accountID

  const account = await db.account.findUnique({ where: { id: accountID } })
  if (!account) return errStatus(400, `Could not find the account ${accountID}`)

  const jwt = await db.jWT.findUnique({ where: { id: token } })
  if (!jwt) return errStatus(400, `Could not find the JWT`)

  if (accountID !== jwt.accountID) return errStatus(400, `JWT is not associated with this account`)

  await db.jWT.delete({ where: { id: token } })

  // Also expires token in cookies
  return {
    statusCode: 302,
    headers: {
      "set-cookie": [`refreshToken=; Path=/; expires=Thu, Jan 01 1970 00:00:00 UTC;`],
      "Access-Control-Allow-Origin": "*",
      Location: "/",
    },
  }
}

/**
 * Verifies if token is valid
 * @param {*} token
 */
const verifyToken = (token: string) =>
  new Promise<{ accountID: string; userID: string; roles: string }>((resolve, reject) => {
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
