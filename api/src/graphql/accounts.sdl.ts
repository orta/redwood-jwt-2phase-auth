export const schema = gql`
  type Account {
    id: String!
    users: [User!]!
  }

  type Query {
    accounts: [Account!]! @requireAuth
    account(id: String!): Account @requireAuth
  }

  type Mutation {
    usersOnAnAccount(jwt: String!): [User!]! @skipAuth
  }
`
