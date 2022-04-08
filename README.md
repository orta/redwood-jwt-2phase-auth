# JWT 2 Phase Auth in Redwood

Re: [this thread](https://community.redwoodjs.com/t/example-app-multi-user-local-jwt-authentication/3007)

An example repo showing 2 factor JWT auth which works with a netflix-style account system (aka one `Account` which can have many `User`s.) Handles switching accounts, logging in via email or username.

It TypeScript-ifies and builds on the work from 3nvy in in ["Local JWT Auth Implementation"](https://community.redwoodjs.com/t/local-jwt-auth-implementation/1359/7).

This code can handle auth via cookies, headers (bearer) and embedded JSON requests which is enough to handle the default Redwood setup and external clients like apps.

### Functions

There are 5 new functions in `api/src/functions`:

- `jwtLogin.ts` - Handles logging in and either returns a full set of tokens or just one
- `jwtLogout.ts` - Handles logout and removing cookies
- `jwtRefresh.ts` - Handles recycling the short term token every 30m
- `jwtSignup.ts` - Handles the creation of a new account
- `jwtUserSwitch.ts` - Lets you switch access tokens between users on an account

### DB

Looks like this:

```prisma
// Represents a person

model User {
  id String @id @unique

  createdAt DateTime @default(now())
  updatedAt DateTime @default(now()) @updatedAt

  username String @unique
  roles    String @default("user")

  account   Account @relation(fields: [accountID], references: [id])
  accountID String
}

// The paying entity

model Account {
  id String @id @unique

  createdAt DateTime @default(now())
  updatedAt DateTime @default(now()) @updatedAt

  email String @unique

  hashedPassword      String
  salt                String
  resetToken          String?
  resetTokenExpiresAt DateTime?

  users User[]
  jwts  JWT[]
}

// A long-term JWT token

model JWT {
  // The ID is the actual JWT token
  id String @id

  account   Account @relation(fields: [accountID], references: [id])
  accountID String
}
```

### App Changes

- `App.tsx` needs to use the new jwtAuthClient at `/web/src/networking/jwtAuthClient.ts`

### Things you would need to do!

The API client needs to silently handle token refreshes - here's how it works for me in my relay code - I'm sure someone knows how to port this to an Apollo link pretty trivially

<details>
  <summary>Refresh for my fetch function</summary>


```ts
if (user) {
  let token = user.accessToken
  const refresh = user.refreshToken

  const { exp } = jwt_decode<JwtPayload>(token)

  // Checks if access token has expired and refresh tokens before proceeding
  if (exp * 1000 < Date.now()) {
    const apiURL = (path: string) => `${global.RWJS_API_URL}/${path}`

    // Send off the long-term JWT in order to ask for a new access token
    const res = await fetch(apiURL("jwtRefresh"), { headers: { Authorization: `Bearer ${refresh}`, "auth-provider": "custom" } })
    const data = await res.json()

    if (res.ok) {
      localStorage.setItem("myAppAuth", JSON.stringify(data))
      token = data.accessToken

    } else {
      console.error("JWT refresh failed")
      console.error(data)
      localStorage.removeItem("myAppAuth")
    }
  }

  if (token) {
    // We either pass the main token of the new revised refresh token
    headers["authorization"] = `Bearer ${token}`
    headers["auth-provider"] = "custom"
  }
}
```

</details>


### Not in this repo

- A User switcher UI. All my code is Relay, and I'm re-creating it here. You'd need to take this into account in your login screen, and inside your user dashboard.

- A new user button. Same problem as above.

I threw the server-side code in for into the repo anyway though.

### Things I think are sketchy

- `isAuthenticated` from `useAuth` is not to be trusted, prefer a check for `currentUser` from `useAuth`. In my app, I don't rely on `useAuth` because most of it comes from RNW and so I don't make the same `getCurrentUser` calls. Open to fixes.

- `getCurrentUser` in auth.ts uses the 2nd param - not the session, not sure what to make of this.
