# ReachInbox.ai — Email Scheduler

A full-stack email scheduling application built with React, TypeScript, Node.js, Express, PostgreSQL, Redis, BullMQ, and Nodemailer. The application allows users to create email campaigns, schedule messages for delivery, and monitor scheduled and sent emails through a dashboard.

## Features

* **Email Campaign Scheduling:** Create campaigns with a subject, email body, recipient list, scheduled start time, sending delay, and hourly sending limit.
* **Bulk Email Processing:** Schedule and process emails through a background job queue using BullMQ and Redis.
* **Email Delivery:** Send emails using SMTP through Nodemailer, with Ethereal Email for development and testing.
* **Campaign Dashboard:** View scheduled campaigns, sent emails, recipient statuses, and campaign statistics.
* **Database Persistence:** Store users, campaigns, and recipient records in PostgreSQL using Prisma ORM.
* **Recipient Validation:** Validate, normalize, and deduplicate recipient email addresses before scheduling.
* **Background Worker:** Process email jobs asynchronously, independently of the API server.
* **Health Monitoring:** Backend endpoints for checking API, database, and queue connectivity.

## Tech Stack

### Frontend

* React
* TypeScript
* Vite
* CSS

### Backend

* Node.js
* Express.js
* TypeScript
* Prisma ORM
* PostgreSQL
* Redis-compatible queue service
* BullMQ
* Nodemailer

### Development Tools

* Git and GitHub
* VS Code
* Postman
* Ethereal Email

## Architecture

```text
                React + TypeScript
                  Frontend
                     |
                     | HTTP API
                     v
              Express + TypeScript
                  Backend
                     |
          +----------+----------+
          |                     |
          v                     v
      PostgreSQL            BullMQ Queue
       (Prisma)                 |
                                v
                         Redis / Memurai
                                |
                                v
                         Email Worker
                                |
                                v
                         Nodemailer SMTP
                                |
                                v
                          Email Delivery
```

## Project Structure

```text
ReachInbox-Assignment/
│
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   ├── src/
│   │   ├── config/
│   │   │   ├── emailQueue.ts
│   │   │   ├── prisma.ts
│   │   │   └── redis.ts
│   │   │
│   │   ├── workers/
│   │   │   └── emailWorker.ts
│   │   │
│   │   └── server.ts
│   │
│   ├── .env
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── .gitignore
└── README.md
```

## Prerequisites

Install the following before running the project:

* Node.js and npm
* PostgreSQL
* Redis or a compatible service such as Memurai on Windows
* Git

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/gayatripalamury/ReachInbox.ai.git
cd ReachInbox.ai
```

### 2. Configure the Backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory with your local configuration:

```env
PORT=5000

DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/reachinbox"

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=YOUR_ETHEREAL_USERNAME
SMTP_PASS=YOUR_ETHEREAL_PASSWORD
```

Replace the example values with your own PostgreSQL and Ethereal Email credentials. Keep `.env` private and never commit secrets to GitHub.

### 3. Set Up the Database

Create a PostgreSQL database named `reachinbox`, then run:

```bash
npx prisma generate
npx prisma db push
```

### 4. Start the Backend API

From the `backend` directory:

```bash
npm run dev
```

The backend API runs at:

`http://localhost:5000`

### 5. Start the Email Worker

Open another terminal:

```bash
cd backend
npm run worker
```

The worker processes queued email jobs independently of the API server.

### 6. Start the Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at:

`http://localhost:5173`

## API Endpoints

| Method | Endpoint                  | Description                               |
| ------ | ------------------------- | ----------------------------------------- |
| GET    | `/`                       | Backend status                            |
| GET    | `/api/health`             | API health check                          |
| GET    | `/api/db-health`          | PostgreSQL connectivity check             |
| GET    | `/api/queue-health`       | Queue connectivity and job counts         |
| POST   | `/api/campaigns/schedule` | Create and schedule an email campaign     |
| GET    | `/api/campaigns`          | Retrieve campaigns and recipient statuses |

### Schedule an Email Campaign

**Endpoint:** `POST /api/campaigns/schedule`

Example request:

```json
{
  "name": "Product Announcement",
  "subject": "Introducing Our New Product",
  "body": "Hello, check out our latest product!",
  "recipients": [
    "recipient1@example.com",
    "recipient2@example.com"
  ],
  "startAt": "2026-10-01T10:00:00.000Z",
  "delayMs": 2000,
  "hourlyLimit": 100
}
```

The API validates the input, stores the campaign and recipient records in PostgreSQL, and queues individual email jobs for background processing.

## Database Models

The application uses Prisma ORM with PostgreSQL.

* **User:** Stores user identity and associated campaigns.
* **Campaign:** Stores campaign name, subject, message body, schedule, delay, hourly limit, status, and owner.
* **Recipient:** Stores recipient email addresses, delivery status, scheduled time, sent time, and error details.

## Email Processing Workflow

1. The user creates an email campaign through the frontend.
2. The backend validates the campaign details and recipient addresses.
3. The campaign and recipient records are stored in PostgreSQL.
4. Individual email jobs are added to the BullMQ queue with scheduled delays.
5. The background worker retrieves and processes queued jobs.
6. Nodemailer sends the emails through the configured SMTP service.
7. Recipient delivery statuses are persisted in the database.
8. The dashboard retrieves campaign and recipient information from the backend.

## Testing Email Delivery

The project uses Ethereal Email for development and testing.

1. Create test SMTP credentials using [Ethereal Email](https://ethereal.email/).
2. Configure the credentials in the backend `.env` file.
3. Start PostgreSQL, Redis or Memurai, the backend API, and the email worker.
4. Create a campaign from the frontend.
5. Check the dashboard for campaign and recipient statuses.
6. Use the Ethereal preview URL generated during email processing to inspect test messages.

Ethereal Email is intended for testing; it does not deliver messages to real recipients' inboxes.

## Development Scripts

### Backend

| Command          | Description                           |
| ---------------- | ------------------------------------- |
| `npm run dev`    | Start the backend in development mode |
| `npm run worker` | Start the background email worker     |
| `npm run build`  | Compile TypeScript                    |

### Frontend

| Command         | Description                       |
| --------------- | --------------------------------- |
| `npm run dev`   | Start the Vite development server |
| `npm run build` | Build the frontend for production |

## Current Implementation Status

* [x] React and TypeScript frontend
* [x] Express and TypeScript backend
* [x] PostgreSQL database integration using Prisma
* [x] Redis-compatible queue integration using BullMQ
* [x] Email campaign scheduling
* [x] Background email processing
* [x] SMTP email sending with Nodemailer
* [x] Campaign and recipient status tracking
* [x] Dashboard for scheduled and sent emails
* [x] API, database, and queue health endpoints
* [ ] Google OAuth login and session-based authentication
* [ ] Final end-to-end authentication testing
* [ ] Production deployment and configuration

## Security and Configuration

* Store credentials and secrets in environment variables.
* Exclude `.env` files from version control.
* Use HTTPS and secure session-cookie settings in production.
* Configure OAuth redirect URLs and allowed frontend origins for the deployment environment.
* Use production-grade SMTP credentials for real email delivery.

## Future Improvements

* Google OAuth authentication and user-specific campaign management
* CSV and TXT recipient import
* Enhanced email delivery analytics
* Campaign retry and failure management
* Production deployment and monitoring
* Automated tests for API endpoints and background processing

## Author

**Lakshmi Gayatri Palamuri**

B.Tech — Computer Science and Engineering (Data Science)

GitHub: [gayatripalamury](https://github.com/gayatripalamury)

Project Repository: [ReachInbox.ai](https://github.com/gayatripalamury/ReachInbox.ai)

---

*Developed as a full-stack email scheduler project using React, TypeScript, Express, PostgreSQL, Redis, BullMQ, and Nodemailer.*
