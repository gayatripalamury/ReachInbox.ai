import { Worker } from "bullmq";
import nodemailer from "nodemailer";
import { redis } from "../config/redis.js";
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.ethereal.email",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});
const worker = new Worker("email-queue", async (job) => {
    const { to, subject, body } = job.data;
    if (!to || !subject || !body) {
        throw new Error("Email job is missing required fields");
    }
    const info = await transporter.sendMail({
        from: `"ReachInbox Test" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text: body,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log("Email processed:", {
        jobId: job.id,
        to,
        messageId: info.messageId,
        previewUrl,
    });
    return {
        messageId: info.messageId,
        previewUrl: previewUrl || null,
    };
}, {
    connection: redis,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 5),
});
worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
});
worker.on("failed", (job, error) => {
    console.error(`Job ${job?.id} failed:`, error.message);
});
console.log("ReachInbox email worker started");
//# sourceMappingURL=emailWorker.js.map