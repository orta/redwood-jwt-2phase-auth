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

  const errStatus = (statusCode: number, reason: string) => ({
    statusCode,
    body: JSON.stringify({ reason }),
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  })

  let refreshToken: string | undefined = undefined

  // Gets refresh token from cookie, headers or body. Throws if non available
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

  const { exp, accountID } = fromRefresh
  if (err || exp * 1000 < Date.now()) return errStatus(400, "Refresh token is expired")

  const account = await db.account.findUnique({ where: { id: accountID }, include: { users: true } })
  if (!account) return errStatus(400, `Could not find account with id ${accountID}`)

  let bodyJSON = undefined
  try {
    bodyJSON = JSON.parse(event.body!)
  } catch (e) {
    return errStatus(400, "Invalid JSON in login body")
  }

  const { username } = bodyJSON
  const newUser = account.users.find((user) => user.username === username)
  if (!newUser) return errStatus(400, `Could not find user on ${accountID} with username ${username}`)

  const roles = newUser.roles
  const userID = newUser.id

  // Generates new pair of tokens
  const accessToken = jwt.sign({ accountID, userID, roles }, process.env.TOKEN_SIGN_KEY!, {
    expiresIn: "30m",
  })

  const newRefreshToken = jwt.sign({ accountID, userID, roles }, process.env.TOKEN_SIGN_KEY!, {
    expiresIn: "1.5y",
  })

  await db.jWT.create({ data: { id: newRefreshToken, accountID } })

  // Expires token on cookies
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
