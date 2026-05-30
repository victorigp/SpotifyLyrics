import { getRedisClient } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();

        const { syncId } = payload;
        if (!syncId) {
            return NextResponse.json({ error: "Missing syncId" }, { status: 400 });
        }

        const redis = await getRedisClient();
        
        // Store the payload in Redis, set it to expire in say 1 hour (3600 seconds)
        // just to avoid cluttering the DB.
        await redis.set(`meld_state:${syncId}`, JSON.stringify(payload), {
            EX: 3600 
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error in /api/meld-sync:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
