import { prisma } from "./config/prisma.js";
import { emailQueue } from "./config/emailQueue.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { redis } from "./config/redis.js";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
}));
app.use(express.json());
app.get("/", (_req, res) => {
    res.json({
        message: "ReachInbox API is running!",
    });
});
app.get("/api/health", (_req, res) => {
    res.json({
        status: "OK",
        service: "ReachInbox Backend",
    });
});
app.get("/api/db-health", async (_req, res) => {
    try {
        await prisma.$queryRaw `SELECT 1`;
        res.json({
            status: "OK",
            database: "Connected"
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            status: "ERROR",
            database: "Disconnected"
        });
    }
});
app.post("/api/test-queue", async (_req, res) => {
    try {
        const job = await emailQueue.add("test-email", {
            to: "test@example.com",
            subject: "BullMQ test",
            body: "Testing the ReachInbox email queue",
        });
        res.json({
            message: "Job added successfully",
            jobId: job.id,
        });
    }
    catch (error) {
        console.error("Queue error:", error);
        res.status(500).json({ error: "Failed to add job" });
    }
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map