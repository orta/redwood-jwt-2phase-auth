export const schema = gql`
  type User {
    id: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    username: String!
    roles: String!
    accountID: String!
  }

  type Query {
    users: [User!]! @requireAuth
    user(id: String!): User @requireAuth
  }

  input CreateUserInput {
    username: String!
    roles: String!
    accountID: String!
  }

  input UpdateUserInput {
    username: String
    roles: String
    accountID: String
  }

  input CreateNewUserOnAccountInput {
    username: String!
    password: String!
  }

  type Mutation {
    createUser(input: CreateUserInput!): User! @requireAuth
    updateUser(id: String!, input: UpdateUserInput!): User! @requireAuth
    deleteUser(id: String!): User! @requireAuth

    # User-level create a new user on that account
    createNewUserOnAccount(input: CreateNewUserOnAccountInput!): User @requireAuth
  }
`
