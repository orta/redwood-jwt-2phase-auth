import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import type { APIGatewayProxyEvent, Context as LambdaContext } from "aws-lambda"
import { Account, User } from "@prisma/client"
import { db } from "src/lib/db"

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

  // Get user data from request body

  let bodyJSON = undefined
  try {
    bodyJSON = JSON.parse(event.body!)
  } catch (e) {
    return errStatus(400, "Invalid JSON in login body")
  }

  const { username, input, password } = bodyJSON

  // The auth has a few potential options:
  // User gives email
  //  - Use email + password to get an account, if we have multiple users on the add them all to the JWT
  //  - use username + password, use user to get account - use password with that - set the JWT to be a specific user
  //

  let account: (Account & { users?: User[] }) | null = null
  let user: User | null = null

  // Looks for existing user based on email
  const accountViaEmail = await db.account.findUnique({
    where: { email: input },
    include: {
      users: true,
    },
  })

  // If we have an account, check if the password is correct, if so, we've got the account
  if (accountViaEmail) {
    const match = await bcrypt.compare(password, accountViaEmail.hashedPassword)
    if (match) {
      account = accountViaEmail
      // If it's only one account, we can log in to that user right away
      if (accountViaEmail.users.length === 1) {
        user = accountViaEmail.users[0]
      }
    } else {
      console.log("passes dont match")
    }
  }

  // The input someone put in could be their alias, so we need to look them up via a user first
  if (!accountViaEmail) {
    const userByUsername = await db.user.findUnique({
      where: { username: input },
      include: { account: true },
    })

    // The input doesn't match an email nor a username, so we can't find a user
    if (!userByUsername) return errStatus(404, "Wrong credentials provided")

    // See if the password matches the account's password
    const match = await bcrypt.compare(password, userByUsername.account.hashedPassword)
    if (match) {
      account = userByUsername.account
      user = userByUsername
    }
  }

  // If we've not found an account via the email or username, we basically
  // can't log you in, so it's time to drop it

  if (!account) return errStatus(404, "Wrong credentials provided")

  // Alright, that's 1/2 of the auth!
  const accountID = account.id

  if (!user && account.users && username) {
    // There's an ambiguity here, if we have multiple users, we can't just pick one
    // we'll instead return a different shaped response with many users. We support
    // passing in a username to pick a specific user as an arg
    user = account.users.find((u) => u.username === username) || null
  }

  // If we don't have enough info, then we give back a JWT which can be used with the
  // root resolver on usersOnAnAccount to get all the users on the account (so you can pick)
  if (!user) {
    const userInfoAccessToken = jwt.sign({ accountID, use: "usersOnAnAccount" }, process.env.TOKEN_SIGN_KEY!, {
      expiresIn: "30m",
    })
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        userInfoAccessToken,
      }),
    }
  }

  const userID = user.id
  const roles = user.roles

  // Generates new pair of tokens
  const accessToken = jwt.sign({ accountID, userID, roles }, process.env.TOKEN_SIGN_KEY!, {
    expiresIn: "30m",
  })
  const refreshToken = jwt.sign({ accountID, userID, roles }, process.env.TOKEN_SIGN_KEY!, {
    expiresIn: "1.5y",
  })

  // Create a JWT entry for the refresh token
  await db.jWT.create({ data: { accountID, id: refreshToken } })

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

const errStatus = (statusCode: number, reason: string) => ({
  statusCode,
  body: JSON.stringify({ reason }),
  headers: {
    "Access-Control-Allow-Origin": "*",
  },
})
