import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL || "redis://redis-18809.c338.eu-west-2-1.ec2.cloud.redislabs.com:18809";

const redisClient = createClient({
    url: redisUrl
});

redisClient.on("error", (err) => console.error("Redis Client Error", err));

let isConnected = false;

export async function getRedisClient() {
    if (!isConnected) {
        await redisClient.connect();
        isConnected = true;
    }
    return redisClient;
}
