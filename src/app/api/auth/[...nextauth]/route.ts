import NextAuth from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";

const SCOPES = [
    "user-read-currently-playing",
    "user-read-playback-state",
].join(" ");

export const authOptions = {
    providers: [
        SpotifyProvider({
            clientId: process.env.SPOTIFY_CLIENT_ID || "",
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
            authorization: {
                params: { scope: SCOPES },
            },
        }),
    ],
    secret: process.env.NEXTAUTH_SECRET || "super_secret_dev_key_123",
    callbacks: {
        async jwt({ token, account }: any) {
            if (account) {
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
                token.expiresAt = account.expires_at;
            }
            return token;
        },
        async session({ session, token }: any) {
            session.accessToken = token.accessToken;
            return session;
        },
    },
    pages: {
        signIn: '/auth/signin',
        error: '/auth/signin', // Redirect to custom page on error
    },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
