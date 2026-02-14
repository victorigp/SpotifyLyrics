import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function GET(req: NextRequest) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || "super_secret_dev_key_123" });
    const accessToken = token?.accessToken;

    if (!accessToken) {
        return NextResponse.json({ error: "Missing or invalid token" }, { status: 401 });
    }

    try {
        const response = await fetch("https://api.spotify.com/v1/me/player/queue", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (response.status === 204 || response.status > 400) {
            return NextResponse.json({ queue: [] });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error fetching queue:", error);
        return NextResponse.json({ error: "Failed to fetch queue" }, { status: 500 });
    }
}
