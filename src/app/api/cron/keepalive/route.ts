import { NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";

// Endpoint para mantener activa la base de datos de Redis Cloud mediante Vercel Cron
export async function GET() {
    try {
        const redis = await getRedisClient();
        const timestamp = new Date().toISOString();
        await redis.set("keepalive", timestamp);
        return NextResponse.json({ ok: true, timestamp });
    } catch (error) {
        console.error("Cron Redis Error:", error);
        return NextResponse.json({ error: "Fallo al conectar con Redis" }, { status: 500 });
    }
}
