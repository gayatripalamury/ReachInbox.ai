
import "dotenv/config";

import express from "express";
import cors from "cors";
import { prisma } from "./config/prisma.js";
import { emailQueue } from "./config/emailQueue.js";

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

// --------------------------------------------------
// Health checks
// --------------------------------------------------

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
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: "OK",
      database: "Connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(500).json({
      status: "ERROR",
      database: "Disconnected",
    });
  }
});

// --------------------------------------------------
// Queue health check
// --------------------------------------------------

app.get("/api/queue-health", async (_req, res) => {
  try {
    const counts = await emailQueue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed"
    );

    res.json({
      status: "OK",
      queue: "Connected",
      counts,
    });
  } catch (error) {
    console.error("Queue health check failed:", error);

    res.status(500).json({
      status: "ERROR",
      queue: "Unavailable",
    });
  }
});

// --------------------------------------------------
// Schedule a campaign
// POST /api/campaigns/schedule
// --------------------------------------------------

app.post("/api/campaigns/schedule", async (req, res) => {
  try {
    const {
      name,
      subject,
      body,
      recipients,
      startAt,
      delayMs = 2000,
      hourlyLimit = 100,
    } = req.body ?? {};

    // Validate required fields.
    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      typeof body !== "string" ||
      !body.trim() ||
      !Array.isArray(recipients) ||
      recipients.length === 0 ||
      typeof startAt !== "string"
    ) {
      return res.status(400).json({
        error:
          "Provide subject, body, a non-empty recipients array, and startAt.",
      });
    }

    if (recipients.length > 10000) {
      return res.status(400).json({
        error: "A campaign can contain at most 10,000 recipients.",
      });
    }

    // Validate schedule date.
    const parsedStartAt = new Date(startAt);

    if (Number.isNaN(parsedStartAt.getTime())) {
      return res.status(400).json({
        error: "Invalid startAt date.",
      });
    }

    // Validate delay and hourly limit.
    if (
      !Number.isInteger(delayMs) ||
      delayMs < 1000 ||
      !Number.isInteger(hourlyLimit) ||
      hourlyLimit < 1
    ) {
      return res.status(400).json({
        error:
          "delayMs must be at least 1000 and hourlyLimit must be positive.",
      });
    }

    // Normalize, validate, and deduplicate email addresses.
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const normalizedRecipients: string[] = [
      ...new Set(
        recipients
          .filter(
            (email: unknown): email is string =>
              typeof email === "string"
          )
          .map((email: string) => email.trim().toLowerCase())
          .filter((email: string) => validEmail.test(email))
      ),
    ];

    if (normalizedRecipients.length === 0) {
      return res.status(400).json({
        error: "No valid recipient email addresses were provided.",
      });
    }

    // Temporary development user.
    // Replace with the authenticated Google OAuth user later.
    const user = await prisma.user.upsert({
      where: {
        email: "dev@reachinbox.local",
      },
      update: {},
      create: {
        name: "Development User",
        email: "dev@reachinbox.local",
      },
    });

    // Save campaign and recipients in PostgreSQL.
    const campaign = await prisma.campaign.create({
      data: {
        name:
          typeof name === "string" && name.trim()
            ? name.trim()
            : subject.trim(),
        subject: subject.trim(),
        body,
        startAt: parsedStartAt,
        delayMs,
        hourlyLimit,
        status: "scheduled",
        userId: user.id,
        recipients: {
          create: normalizedRecipients.map(
            (email: string, index: number) => ({
              email,
              status: "pending",
              scheduledAt: new Date(
                parsedStartAt.getTime() + index * delayMs
              ),
            })
          ),
        },
      },
      include: {
        recipients: true,
      },
    });

    // Queue one delayed job per recipient.
    // Both IDs are required by the email worker.
    const jobs = await Promise.all(
      campaign.recipients.map((recipient) =>
        emailQueue.add(
          "send-email",
          {
            to: recipient.email,
            subject: campaign.subject,
            body: campaign.body,
            campaignId: campaign.id,
            recipientId: recipient.id,
          },
          {
            jobId: `campaign-${campaign.id}-recipient-${recipient.id}`,
            delay: Math.max(
              0,
              (recipient.scheduledAt?.getTime() ?? Date.now()) -
                Date.now()
            ),
          }
        )
      )
    );

    return res.status(201).json({
      message: "Campaign saved and email jobs queued.",
      campaignId: campaign.id,
      totalRecipients: normalizedRecipients.length,
      queuedJobs: jobs.length,
      startAt: campaign.startAt,
    });
  } catch (error) {
    console.error("Campaign scheduling failed:", error);

    return res.status(500).json({
      error: "Failed to schedule campaign.",
    });
  }
});

// --------------------------------------------------
// Get saved campaigns and recipient statuses
// GET /api/campaigns
// --------------------------------------------------

app.get("/api/campaigns", async (_req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        recipients: {
          orderBy: {
            scheduledAt: "asc",
          },
        },
      },
    });

    const result = campaigns.map((campaign) => {
      const recipientStatuses = campaign.recipients.map(
        (recipient) => ({
          id: recipient.id,
          email: recipient.email,
          status: recipient.status,
          scheduledAt: recipient.scheduledAt,
          sentAt: recipient.sentAt,
          error: recipient.error,
        })
      );

      const allSent =
        campaign.recipients.length > 0 &&
        campaign.recipients.every(
          (recipient) => recipient.status === "sent"
        );

      const hasFailed = campaign.recipients.some(
        (recipient) => recipient.status === "failed"
      );

      const hasSent = campaign.recipients.some(
        (recipient) => recipient.status === "sent"
      );

      const status = allSent
        ? "Sent"
        : hasFailed
          ? "Completed with errors"
          : hasSent
            ? "Sending"
            : "Scheduled";

      return {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        body: campaign.body,
        startAt: campaign.startAt,
        status,
        recipients: campaign.recipients.map(
          (recipient) => recipient.email
        ),
        recipientStatuses,
        totalRecipients: campaign.recipients.length,
        sentCount: campaign.recipients.filter(
          (recipient) => recipient.status === "sent"
        ).length,
        pendingCount: campaign.recipients.filter(
          (recipient) => recipient.status === "pending"
        ).length,
        failedCount: campaign.recipients.filter(
          (recipient) => recipient.status === "failed"
        ).length,
      };
    });

    return res.json({
      campaigns: result,
    });
  } catch (error) {
    console.error("Failed to fetch campaigns:", error);

    return res.status(500).json({
      error: "Failed to fetch campaigns.",
    });
  }
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// --------------------------------------------------
// Graceful shutdown
// --------------------------------------------------

let isShuttingDown = false;

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("Shutting down ReachInbox API...");

  server.close(async () => {
    try {
      await emailQueue.close();
      await prisma.$disconnect();

      console.log("ReachInbox API shut down successfully.");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  });
}

process.once("SIGINT", () => {
  void shutdown();
});

process.once("SIGTERM", () => {
  void shutdown();
});