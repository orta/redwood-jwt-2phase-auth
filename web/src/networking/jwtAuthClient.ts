import jwt_decode from "jwt-decode"

type AuthResponseSuccess = {
  refreshToken: string
  accessToken: string
  data: {
    userID: string
    accountID: string
    roles: string
  }
}

type AuthResponseError = { reason: string }
type AuthResponse = AuthResponseSuccess | AuthResponseError
type LoginAuthResponse = AuthResponse | { userInfoAccessToken: string }

export const createClientSideAuthClient = () => {
  const apiURL = (path: string) => `${global.RWJS_API_URL}/${path}`
  const localStorageName = "example-app-auth"

  const JWTAuthClient: import("@redwoodjs/auth/dist/authClients").AuthClient = {
    type: "custom",
    client: "custom",
    login: ({ password, email }) =>
      fetch(apiURL("jwtLogin"), { method: "POST", body: JSON.stringify({ input: email, password }) })
        .then((res) => res.json() as Promise<LoginAuthResponse>)
        .then((json) => {
          if ("reason" in json) throw new Error(json.reason)

          // This means you've got to handle selecting a user for the account, so we don't store
          // the details yet - because you'll be hitting login again with a 'username' param.
          if ("userInfoAccessToken" in json) {
            return json
          }

          if (json?.accessToken) {
            localStorage.setItem(localStorageName, JSON.stringify(json))
            return json
          }

          throw new Error("Unknown login response")
        }),

    signup: (info) =>
      fetch(apiURL("jwtSignup"), { method: "POST", body: JSON.stringify(info) })
        .then((res) => res.json() as Promise<AuthResponse>)
        .then((json) => {
          localStorage.setItem(localStorageName, JSON.stringify(json))
          return json
        }),

    logout: () => {
      const token = JSON.parse(localStorage.getItem(localStorageName) || "{}").accessToken
      fetch(apiURL("jwtLogout"), { method: "POST", body: JSON.stringify({ token }) })
        .then((res) => res.json() as Promise<AuthResponse>)
        .then((json) => {
          return json
        })
        .finally(() => {
          localStorage.removeItem(localStorageName)
        })
    },

    getToken: () => {
      const token = JSON.parse(localStorage.getItem(localStorageName) || "{}").accessToken
      const decoded = jwt_decode(token)
      if (!decoded) {
        localStorage.removeItem(localStorageName)
        throw Error("Invalid access token")
      }
      return token
    },

    getUserMetadata: () => {
      return JSON.parse(localStorage.getItem(localStorageName) || "{}")
    },
  }

  return JWTAuthClient
}
