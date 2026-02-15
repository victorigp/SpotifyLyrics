import NextAuth from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";

const SCOPES = [
    "user-read-currently-playing",
    "user-read-playback-state",
    "user-read-private",
    "user-read-email"
].join(" ");

async function refreshAccessToken(token: any) {
    try {
        const url =
            "https://accounts.spotify.com/api/token?" +
            new URLSearchParams({
                client_id: process.env.SPOTIFY_CLIENT_ID || "",
                client_secret: process.env.SPOTIFY_CLIENT_SECRET || "",
                grant_type: "refresh_token",
                refresh_token: token.refreshToken,
            })

        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method: "POST",
        })

        const refreshedTokens = await response.json()

        if (!response.ok) {
            throw refreshedTokens
        }

        return {
            ...token,
            accessToken: refreshedTokens.access_token,
            accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
            refreshToken: refreshedTokens.refresh_token ?? token.refreshToken, // Fallback to old refresh token
        }
    } catch (error) {
        console.log(error)

        return {
            ...token,
            error: "RefreshAccessTokenError",
        }
    }
}

export const authOptions: any = {
    providers: [
        SpotifyProvider({
            clientId: process.env.SPOTIFY_CLIENT_ID || "",
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
            authorization: {
                params: {
                    scope: SCOPES,
                    show_dialog: "true",
                },
            },
        }),
    ],
    secret: process.env.NEXTAUTH_SECRET || "super_secret_dev_key_123",
    callbacks: {
        async jwt({ token, account, user, profile }: any) {
            // Initial sign in
            if (account && user) {
                return {
                    accessToken: account.access_token,
                    refreshToken: account.refresh_token,
                    accessTokenExpires: account.expires_at * 1000,
                    user,
                    product: profile?.product,
                }
            }

            // Return previous token if the access token has not expired yet
            if (Date.now() < token.accessTokenExpires) {
                return token
            }

            // Access token has expired, try to update it
            return refreshAccessToken(token)
        },
        async session({ session, token }: any) {
            session.user = token.user
            session.accessToken = token.accessToken
            session.error = token.error
            session.product = token.product
            return session
        },
    },
    pages: {
        signIn: '/auth/signin',
        error: '/auth/signin', // Redirect to custom page on error
    },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
