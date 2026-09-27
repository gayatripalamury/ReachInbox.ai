
import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import "./App.css";

type EmailStatus = "Scheduled" | "Sent" | "Failed";

type EmailItem = {
  id: string;
  subject: string;
  recipients: string[];
  startAt: string;
  status: EmailStatus;
};

type ApiRecipient = {
  id: string;
  email: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  error: string | null;
};

type ApiCampaign = {
  id: string;
  name: string;
  subject: string;
  body: string;
  startAt: string;
  status: string;
  recipients: string[];
  recipientStatuses?: ApiRecipient[];
  totalRecipients?: number;
  sentCount?: number;
  pendingCount?: number;
  failedCount?: number;
};

const API = "http://localhost:5000";

export default function App() {
  const [view, setView] = useState<EmailStatus>("Scheduled");
  const [composeOpen, setComposeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [emails, setEmails] = useState<EmailItem[]>([]);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState("");
  const [startAt, setStartAt] = useState("");
  const [delayMs, setDelayMs] = useState("2000");
  const [hourlyLimit, setHourlyLimit] = useState("100");
  const [campaignName, setCampaignName] = useState("");

  // Safely extract campaigns from either an array response
  // or an object such as { campaigns: [...] }.
  function extractCampaigns(data: unknown): ApiCampaign[] {
    if (Array.isArray(data)) {
      return data as ApiCampaign[];
    }

    if (data && typeof data === "object") {
      const result = data as Record<string, unknown>;

      if (Array.isArray(result.campaigns)) {
        return result.campaigns as ApiCampaign[];
      }

      if (Array.isArray(result.data)) {
        return result.data as ApiCampaign[];
      }

      if (Array.isArray(result.results)) {
        return result.results as ApiCampaign[];
      }
    }

    return [];
  }

  // Fetch campaigns saved in the backend database.
  const loadCampaigns = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API}/api/campaigns`);

      if (!response.ok) {
        throw new Error(
          `Could not load campaigns. Server returned ${response.status}.`,
        );
      }

      const data: unknown = await response.json();
      const campaigns = extractCampaigns(data);

      console.log("Campaign API response:", data);
      console.log("Campaigns extracted:", campaigns);

      const loadedEmails: EmailItem[] = campaigns.flatMap((campaign) => {
        const campaignRecipients = Array.isArray(
          campaign.recipientStatuses,
        )
          ? campaign.recipientStatuses
          : [];

        return campaignRecipients.map((recipient) => {
          const normalizedStatus = String(
            recipient.status ?? "",
          ).toLowerCase();

          let status: EmailStatus = "Scheduled";

          if (normalizedStatus === "sent") {
            status = "Sent";
          } else if (normalizedStatus === "failed") {
            status = "Failed";
          }

          return {
            id:
              recipient.id ||
              `${campaign.id}-${recipient.email}`,
            subject: campaign.subject || campaign.name || "(No subject)",
            recipients: [recipient.email],
            startAt:
              recipient.scheduledAt ||
              recipient.sentAt ||
              campaign.startAt,
            status,
          };
        });
      });

      setEmails(loadedEmails);
      setNotice("");
    } catch (error) {
      console.error("Failed to load campaigns:", error);

      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to load campaigns. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Load saved campaigns when the dashboard first opens.
  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const shownEmails = emails.filter(
    (email) => email.status === view,
  );

  const scheduledCount = emails.filter(
    (email) => email.status === "Scheduled",
  ).length;

  const sentCount = emails.filter(
    (email) => email.status === "Sent",
  ).length;

  const failedCount = emails.filter(
    (email) => email.status === "Failed",
  ).length;

  function resetForm() {
    setSubject("");
    setBody("");
    setRecipients("");
    setCampaignName("");
    setStartAt("");
    setDelayMs("2000");
    setHourlyLimit("100");
  }

  async function scheduleCampaign(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setNotice("");

    const recipientList = recipients
      .split(/[\n,;]+/)
      .map((email) => email.trim())
      .filter(Boolean);

    if (recipientList.length === 0) {
      setNotice(
        "Please enter at least one recipient email address.",
      );
      return;
    }

    if (!subject.trim()) {
      setNotice("Please enter an email subject.");
      return;
    }

    if (!body.trim()) {
      setNotice("Please enter the email body.");
      return;
    }

    if (!startAt) {
      setNotice("Please choose a start date and time.");
      return;
    }

    if (
      !Number.isFinite(Number(delayMs)) ||
      Number(delayMs) < 1000
    ) {
      setNotice(
        "Delay between emails must be at least 1000 milliseconds.",
      );
      return;
    }

    if (
      !Number.isFinite(Number(hourlyLimit)) ||
      Number(hourlyLimit) < 1
    ) {
      setNotice("Hourly limit must be at least 1.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API}/api/campaigns/schedule`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: campaignName.trim() || subject.trim(),
            subject: subject.trim(),
            body: body.trim(),
            recipients: recipientList,
            startAt: new Date(startAt).toISOString(),
            delayMs: Number(delayMs),
            hourlyLimit: Number(hourlyLimit),
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Could not schedule campaign.",
        );
      }

      resetForm();
      setComposeOpen(false);
      setView("Scheduled");

      setNotice(
        `Campaign scheduled successfully! ${
          result.queuedJobs ?? recipientList.length
        } email job(s) queued.`,
      );

      // Reload the database-backed list after scheduling.
      await loadCampaigns();
    } catch (error) {
      console.error("Scheduling failed:", error);

      setNotice(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function openCompose() {
    setNotice("");
    setComposeOpen(true);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">O</div>
          <span>Outbox Labs</span>
          <span className="brand-chevron">⌄</span>
        </div>

        <button
          className="compose-sidebar"
          onClick={openCompose}
        >
          <span>＋</span> Compose
        </button>

        <div className="side-label">EMAILS</div>

        <button
          className={`nav-item ${
            view === "Scheduled" ? "active" : ""
          }`}
          onClick={() => setView("Scheduled")}
        >
          <span className="nav-icon">◷</span>
          <span>Scheduled</span>
          <span className="nav-count">
            {scheduledCount}
          </span>
        </button>

        <button
          className={`nav-item ${
            view === "Sent" ? "active" : ""
          }`}
          onClick={() => setView("Sent")}
        >
          <span className="nav-icon">➤</span>
          <span>Sent</span>
          <span className="nav-count">
            {sentCount}
          </span>
        </button>

        <button
          className={`nav-item ${
            view === "Failed" ? "active" : ""
          }`}
          onClick={() => setView("Failed")}
        >
          <span className="nav-icon">!</span>
          <span>Failed</span>
          <span className="nav-count">
            {failedCount}
          </span>
        </button>

        <div className="sidebar-bottom">
          <div className="profile-avatar">G</div>

          <div className="profile-info">
            <strong>Gayatri</strong>
            <span>Development account</span>
          </div>

          <button
            className="profile-menu"
            title="Account menu"
            onClick={() =>
              setNotice(
                "Google sign-in and logout are not connected yet.",
              )
            }
          >
            ⋯
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-muted">
              Inbox
            </span>
            <span className="breadcrumb-divider">/</span>
            <strong>{view}</strong>
          </div>

          <div className="topbar-actions">
            <div className="connection">
              <span /> Backend connected
            </div>

            <button
              className="icon-button"
              title="Refresh campaigns"
              onClick={() => void loadCampaigns()}
              disabled={loading}
            >
              ↻
            </button>

            <div className="top-avatar">G</div>
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <h1>{view} Emails</h1>
              <p>
                {view === "Scheduled"
                  ? "Manage your upcoming email campaigns."
                  : view === "Sent"
                    ? "Review emails sent through your campaigns."
                    : "Review emails that failed to send."}
              </p>
            </div>

            <button
              className="primary-button"
              onClick={openCompose}
            >
              <span>＋</span> Compose New Email
            </button>
          </div>

          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          <div className="list-toolbar">
            <div className="list-tabs">
              <button
                className={
                  view === "Scheduled"
                    ? "tab active-tab"
                    : "tab"
                }
                onClick={() => setView("Scheduled")}
              >
                Scheduled
              </button>

              <button
                className={
                  view === "Sent"
                    ? "tab active-tab"
                    : "tab"
                }
                onClick={() => setView("Sent")}
              >
                Sent
              </button>

              <button
                className={
                  view === "Failed"
                    ? "tab active-tab"
                    : "tab"
                }
                onClick={() => setView("Failed")}
              >
                Failed
              </button>
            </div>

            <div className="search-box">
              <span>⌕</span>
              <input
                aria-label="Search emails"
                placeholder="Search emails..."
              />
            </div>
          </div>

          {loading && emails.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◌</div>
              <h2>Loading campaigns...</h2>
              <p>
                Fetching your saved emails from the backend.
              </p>
            </div>
          ) : shownEmails.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                {view === "Scheduled"
                  ? "◷"
                  : view === "Sent"
                    ? "➤"
                    : "!"}
              </div>

              <h2>
                No {view.toLowerCase()} emails yet
              </h2>

              <p>
                {view === "Scheduled"
                  ? "Compose an email and choose when it should be sent."
                  : view === "Sent"
                    ? "Emails you send will appear here."
                    : "Emails that fail to send will appear here."}
              </p>

              {view !== "Failed" && (
                <button
                  className="primary-button"
                  onClick={openCompose}
                >
                  ＋ Compose New Email
                </button>
              )}
            </div>
          ) : (
            <div className="email-list">
              {shownEmails.map((email) => (
                <article
                  className="email-row"
                  key={email.id}
                >
                  <div className="email-status-icon">
                    {email.status === "Scheduled"
                      ? "◷"
                      : email.status === "Sent"
                        ? "✓"
                        : "!"}
                  </div>

                  <div className="email-details">
                    <strong>{email.subject}</strong>
                    <span>
                      To: {email.recipients.join(", ")}
                    </span>
                  </div>

                  <div className="email-date">
                    {email.startAt
                      ? new Date(
                          email.startAt,
                        ).toLocaleString()
                      : "—"}
                  </div>

                  <span
                    className={`status-pill ${email.status.toLowerCase()}`}
                  >
                    {email.status}
                  </span>
                </article>
              ))}
            </div>
          )}

          <div className="footer-note">
            <span className="footer-dot" />
            Connected to ReachInbox API
          </div>
        </section>
      </main>

      {composeOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setComposeOpen(false);
            }
          }}
        >
          <section
            className="compose-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compose-title"
          >
            <div className="modal-header">
              <div>
                <button
                  className="back-button"
                  type="button"
                  onClick={() => setComposeOpen(false)}
                >
                  ←
                </button>
                <h2 id="compose-title">
                  Compose New Email
                </h2>
              </div>

              <button
                className="close-button"
                type="button"
                onClick={() => setComposeOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={scheduleCampaign}>
              <div className="form-scroll">
                <label className="field">
                  <span>
                    Campaign name <small>Optional</small>
                  </span>
                  <input
                    value={campaignName}
                    onChange={(event) =>
                      setCampaignName(event.target.value)
                    }
                    placeholder="e.g. September outreach"
                  />
                </label>

                <label className="field">
                  <span>
                    To <b>*</b>
                  </span>
                  <textarea
                    value={recipients}
                    onChange={(event) =>
                      setRecipients(event.target.value)
                    }
                    placeholder="recipient@example.com, another@example.com"
                    rows={3}
                    required
                  />
                  <small>
                    Enter email addresses separated by
                    commas or new lines.
                  </small>
                </label>

                <label className="field">
                  <span>
                    Subject <b>*</b>
                  </span>
                  <input
                    value={subject}
                    onChange={(event) =>
                      setSubject(event.target.value)
                    }
                    placeholder="Enter email subject"
                    required
                  />
                </label>

                <div className="schedule-fields">
                  <label className="field">
                    <span>
                      Start date &amp; time <b>*</b>
                    </span>
                    <input
                      type="datetime-local"
                      value={startAt}
                      onChange={(event) =>
                        setStartAt(event.target.value)
                      }
                      min={new Date(
                        Date.now() -
                          new Date().getTimezoneOffset() *
                            60000,
                      )
                        .toISOString()
                        .slice(0, 16)}
                      required
                    />
                  </label>

                  <label className="field">
                    <span>
                      Delay between emails (ms)
                    </span>
                    <input
                      type="number"
                      min="1000"
                      step="500"
                      value={delayMs}
                      onChange={(event) =>
                        setDelayMs(event.target.value)
                      }
                      required
                    />
                  </label>

                  <label className="field">
                    <span>Hourly limit</span>
                    <input
                      type="number"
                      min="1"
                      value={hourlyLimit}
                      onChange={(event) =>
                        setHourlyLimit(event.target.value)
                      }
                      required
                    />
                  </label>
                </div>

                <label className="field">
                  <span>
                    Email body <b>*</b>
                  </span>

                  <div className="editor-toolbar">
                    <button
                      type="button"
                      title="Bold"
                    >
                      <b>B</b>
                    </button>
                    <button
                      type="button"
                      title="Italic"
                    >
                      <i>I</i>
                    </button>
                    <button
                      type="button"
                      title="Underline"
                    >
                      <u>U</u>
                    </button>
                    <span className="toolbar-divider" />
                    <button
                      type="button"
                      title="Bulleted list"
                    >
                      ☷
                    </button>
                    <button
                      type="button"
                      title="Link"
                    >
                      ↗
                    </button>
                  </div>

                  <textarea
                    className="body-editor"
                    value={body}
                    onChange={(event) =>
                      setBody(event.target.value)
                    }
                    placeholder="Type your email here..."
                    rows={8}
                    required
                  />
                </label>
              </div>

              <div className="modal-footer">
                <span className="secure-note">
                  ✦ Emails are queued for scheduled processing
                </span>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setComposeOpen(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={loading}
                  >
                    {loading
                      ? "Scheduling..."
                      : "Schedule Email"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}