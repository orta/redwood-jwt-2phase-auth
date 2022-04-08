import to from "await-to-js"
import { db } from "src/lib/db"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

import cuid from "cuid"
import type { APIGatewayProxyEvent, Context as LambdaContext } from "aws-lambda"
import { canUseHandle } from "src/services/users/users"

export const handler = async (event: APIGatewayProxyEvent, _context: LambdaContext) => {
  // Preflight requests to this endpoint which say what a client is allowed to send
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "*",
      },
    }
  }

  // Get user from request body
  const { email, password, username: unsluggedUsername } = JSON.parse(event.body!)

  const returnRes = (statusCode: number, body: any) => ({
    statusCode,
    body: JSON.stringify(body),
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  })

  const verify = ["email", email, "password", password, "username", unsluggedUsername]

  for (let index = 0; index < verify.length; index += 2) {
    const name = verify[index]
    const value = verify[index + 1]
    if (!value) {
      return returnRes(400, { error: `${name} is required` })
    }
  }

  const username = await canUseHandle(unsluggedUsername)
  if (!username) {
    return returnRes(400, { error: `Cannot use ${unsluggedUsername} as username` })
  }

  // Encrypt password
  const salt = await bcrypt.genSalt(10)
  const encryptedPassword = await bcrypt.hash(password, salt)

  const isDev = process.env.DATABASE_URL!.includes("localhost:")
  const roles = isDev ? "user admin" : "user"

  let userID = cuid() + ":user"
  const accountID = cuid() + ":account"

  // Generate Auth tokens
  const accessToken = jwt.sign({ accountID, userID, roles }, process.env.TOKEN_SIGN_KEY!, {
    expiresIn: "30m",
  })
  // This is reasonable enough IMO
  const refreshToken = jwt.sign({ accountID, userID, roles }, process.env.TOKEN_SIGN_KEY!, {
    expiresIn: "1.5y",
  })

  // If the username starts with 'orta' then port the username into the id
  // so that its easy to track when eyeballing the DB
  if (username.startsWith("orta")) {
    const wordInID = username + "-"
    for (let i = 0; i < wordInID.length; i++) {
      const element = wordInID[i]
      userID = userID.substring(0, i + 1) + element + userID.substring(i + 2)
    }
  }

  const [error, _] = await to(
    db.user.create({
      data: {
        id: userID,
        username,
        roles,
        account: {
          create: {
            id: accountID,
            email,
            hashedPassword: encryptedPassword,
            salt,
          },
        },
      },
    })
  )

  // If theres an error on user creation, throws an error
  if (error) return returnRes(400, { errors: [{ message: error.message }] })

  // Add the JWT to the db
  await db.jWT.create({ data: { id: refreshToken, accountID: accountID } })

  return {
    statusCode: 200,
    // Set auth cookies on response headers
    headers: {
      "set-cookie": [`refreshToken=${refreshToken}; Path=/; HttpOnly`],
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      refreshToken,
      accessToken,
      data: {
        userID,
        accountID,
        roles,
      },
    }),
  }
}
