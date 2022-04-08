import { useAuth } from "@redwoodjs/auth"
import { Link, routes } from "@redwoodjs/router"
import { MetaTags } from "@redwoodjs/web"

const HomePage = () => {
  const auth = useAuth()

  return (
    <>
      <MetaTags title="Home" description="Home page" />

      <h1>HomePage</h1>
      <p>
        Find me in <code>./web/src/pages/HomePage/HomePage.tsx</code>
      </p>

      <ul>
        <li>
          <a href={routes.login()}>Login</a>
        </li>
        <li>
          <a href={routes.signup()}>Signup</a>
        </li>
      </ul>

      <div style={{ border: "1px solid black", padding: 4 }}>
        <p>Auth info</p>
        <pre>{JSON.stringify(auth, null, 2)}</pre>
      </div>
    </>
  )
}

export default HomePage
