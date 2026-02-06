import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
    /**
     * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
     */
    interface Session {
        accessToken?: string
        error?: string
        user: {
            /** The user's postal address. */
            address?: string
        } & DefaultSession["user"]
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        accessToken?: string
        refreshToken?: string
        accessTokenExpires?: number
        error?: string
    }
}
