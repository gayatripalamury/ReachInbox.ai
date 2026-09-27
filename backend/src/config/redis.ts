
import { Redis } from "ioredis";

export const redis = new Redis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  console.log("Redis connected successfully");
});

redis.on("error", (error: Error) => {
  console.error("Redis connection error:", error);
});