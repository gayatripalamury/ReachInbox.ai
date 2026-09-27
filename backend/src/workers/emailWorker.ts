
import "dotenv/config";
import { Worker } from "bullmq";
import type { Job } from "bullmq";
import nodemailer from "nodemailer";
import { redis } from "../config/redis.js";
import { prisma } from "../config/prisma.js";

type EmailJobData = {
  to: string;
  subject: string;
  body: string;
  campaignId: string;
  recipientId: string;
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Update the campaign once all its recipients have finished processing.
async function updateCampaignStatus(campaignId: string) {
  const counts = await prisma.recipient.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });

  const pendingCount =
    counts.find((item) => item.status === "pending")?._count._all ?? 0;

  const failedCount =
    counts.find((item) => item.status === "failed")?._count._all ?? 0;

  if (pendingCount === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: failedCount > 0 ? "completed_with_errors" : "sent",
      },
    });
  }
}

const worker = new Worker<EmailJobData>(
  "email-queue",
  async (job: Job<EmailJobData>) => {
    const { to, subject, body, campaignId, recipientId } = job.data;

    // Validate the job payload.
    if (!to || !subject || !body || !campaignId || !recipientId) {
      throw new Error(
        "Email job is missing to, subject, body, campaignId, or recipientId"
      );
    }

    // Confirm the recipient exists and belongs to this campaign.
    const recipient = await prisma.recipient.findUnique({
      where: { id: recipientId },
    });

    if (!recipient || recipient.campaignId !== campaignId) {
      throw new Error("Recipient not found or campaign ID does not match");
    }

    // Avoid resending if a previous attempt already updated the database.
    if (recipient.status === "sent") {
      console.log(`Recipient ${recipientId} is already marked sent`);
      return { skipped: true, reason: "Already sent" };
    }

    // Send the email through Ethereal SMTP.
    const info = await transporter.sendMail({
      from: `"ReachInbox Test" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: body,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    // Persist the successful send in PostgreSQL.
    const updated = await prisma.recipient.updateMany({
      where: {
        id: recipientId,
        campaignId,
      },
      data: {
        status: "sent",
        sentAt: new Date(),
        error: null,
      },
    });

    if (updated.count !== 1) {
      throw new Error("Could not update the recipient's sent status");
    }

    // Refresh the campaign status after updating the recipient.
    await updateCampaignStatus(campaignId);

    console.log("Email sent successfully:", {
      jobId: job.id,
      recipientId,
      campaignId,
      to,
      messageId: info.messageId,
      previewUrl,
    });

    return {
      messageId: info.messageId,
      previewUrl: previewUrl || null,
    };
  },
  {
    connection: redis,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 5),
  }
);

// Log completed jobs.
worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

// Mark recipients failed only after all configured attempts are exhausted.
worker.on("failed", async (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);

  if (!job) return;

  const { recipientId, campaignId } = job.data;

  if (!recipientId || !campaignId) {
    console.error("Cannot update failed recipient: missing job IDs");
    return;
  }

  const maxAttempts = job.opts.attempts ?? 1;

  if (job.attemptsMade < maxAttempts) {
    console.log(
      `Job ${job.id} will retry (${job.attemptsMade}/${maxAttempts})`
    );
    return;
  }

  try {
    await prisma.recipient.updateMany({
      where: {
        id: recipientId,
        campaignId,
        status: { not: "sent" },
      },
      data: {
        status: "failed",
        error: error.message,
      },
    });

    await updateCampaignStatus(campaignId);

    console.log(`Recipient ${recipientId} marked as failed`);
  } catch (updateError) {
    console.error("Failed to update recipient status:", updateError);
  }
});

// Report worker-level errors.
worker.on("error", (error) => {
  console.error("Worker error:", error);
});

console.log("ReachInbox email worker started");

// Gracefully close worker and database connection on shutdown.
async function shutdown() {
  console.log("Shutting down email worker...");

  try {
    await worker.close();
    await prisma.$disconnect();
    console.log("Email worker stopped");
    process.exit(0);
  } catch (error) {
    console.error("Error during worker shutdown:", error);
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());