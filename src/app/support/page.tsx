"use client";
import { useEffect, useState } from "react";
import {
  Search,
  ShieldCheck,
  Users,
  Inbox,
  ClipboardCheck,
  ArrowRight,
  RefreshCw,
  LogOut,
  KeyRound,
  FileText,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { customerSnapshot } from "@/lib/support/customer";
import { FEATURES } from "@/lib/support/policy";
import "./support.css";
type Snapshot = Awaited<ReturnType<typeof customerSnapshot>>;
type Staff = {
  id: string;
  name: string;
  email: string;
  role: string;
  active?: boolean;
};
type Case = {
  id: string;
  subject: string;
  issue: string;
  customer_id: string | null;
  thread_id: string | null;
  status: string;
  draft: string | null;
  updated_at: string;
};
type Action = {
  id: string;
  customer_id: string;
  kind: string;
  reason: string;
  status: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  created_at: string;
};
type Token = { token_hash: string; name: string; expires_at: string };
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/support/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
}
const date = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-IN") : "—";
export default function SupportWorkspace() {
  const [staff, setStaff] = useState<Staff | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState("customers"),
    [search, setSearch] = useState(""),
    [matches, setMatches] = useState<Snapshot["user"][]>([]),
    [searchPayments, setSearchPayments] = useState<Snapshot["payments"]>([]),
    [customer, setCustomer] = useState<Snapshot | null>(null);
  const [cases, setCases] = useState<Case[]>([]),
    [activeCase, setActiveCase] = useState<Case | null>(null),
    [actions, setActions] = useState<Action[]>([]),
    [team, setTeam] = useState<Staff[]>([]),
    [tokens, setTokens] = useState<Token[]>([]);
  const [draft, setDraft] = useState(""),
    [selectedReports, setSelectedReports] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [force, setForce] = useState(false),
    [secret, setSecret] = useState("");
  const [loginMode, setLoginMode] = useState("login"),
    [invite, setInvite] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "invite",
    );
    if (token) {
      setInvite(token);
      setLoginMode("activate");
      history.replaceState(null, "", "/support");
    }
    api<{ staff: Staff }>("me")
      .then((x) => setStaff(x.staff))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not finish");
    } finally {
      setBusy(false);
    }
  }
  async function loadCustomer(id: string) {
    const value = await api<Snapshot>(`customers/${encodeURIComponent(id)}`);
    setCustomer(value);
    setSelectedReports(value.reports.filter((r) => r.ready).map((r) => r.key));
  }
  async function refresh() {
    const [c, a] = await Promise.all([
      api<{ cases: Case[] }>("cases"),
      api<{ actions: Action[] }>("actions"),
    ]);
    setCases(c.cases);
    setActions(a.actions);
    if (customer) await loadCustomer(customer.user.id);
  }
  const staffId = staff?.id;
  useEffect(() => {
    if (!staffId) return;
    let current = true;
    Promise.all([
      api<{ cases: Case[] }>("cases"),
      api<{ actions: Action[] }>("actions"),
    ])
      .then(([c, a]) => {
        if (current) {
          setCases(c.cases);
          setActions(a.actions);
        }
      })
      .catch(() => {
        if (current)
          setNotice("Could not load the support queue. Refresh to retry.");
      });
    return () => {
      current = false;
    };
  }, [staffId]);
  async function openCase(c: Case) {
    setActiveCase(c);
    setDraft(c.draft || "");
    setReason(c.issue);
    setTab("customers");
    if (c.customer_id) await loadCustomer(c.customer_id);
    else setCustomer(null);
  }
  async function repair(kind: string, payload: Record<string, unknown>) {
    if (!customer) return;
    if (!reason.trim())
      throw new Error(
        "Add the customer’s issue or evidence before running a repair.",
      );
    if (activeCase) setActiveCase({ ...activeCase, status: "open" });
    const response = await api<{
      status: string;
      result?: { message?: string };
    }>("actions", {
      kind,
      payload,
      customerId: customer.user.id,
      caseId:
        activeCase?.customer_id === customer.user.id
          ? activeCase!.id
          : undefined,
      reason,
      requestKey: crypto.randomUUID(),
    });
    setNotice(
      response.status === "complete"
        ? "Repair completed and saved."
        : response.status === "awaiting_approval"
          ? "Requested owner approval."
          : response.result?.message || "This repair needs review.",
    );
    await refresh();
  }
  const form = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    ) as Record<string, string>;
  };
  if (loading)
    return (
      <main className="support-root support-center">
        Opening support workspace…
      </main>
    );
  if (!staff)
    return (
      <main className="support-root support-center">
        <section className="support-login">
          <div className="support-brand">
            <ShieldCheck />
            <span>
              AstroRekha <small>SUPPORT WORKSPACE</small>
            </span>
          </div>
          <h1>
            {loginMode === "bootstrap"
              ? "Set up your support team"
              : loginMode === "activate"
                ? "Activate your staff account"
                : "Welcome back"}
          </h1>
          <p>
            Individual access to customer recovery. Every repair is recorded.
          </p>
          <form
            onSubmit={(e) => {
              const fields = form(e);
              void run(async () => {
                if (loginMode === "bootstrap") {
                  const response = await fetch("/api/admin/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      adminId: fields.adminId,
                      password: fields.adminPassword,
                    }),
                  });
                  const admin = await response.json();
                  if (!response.ok || !admin.token)
                    throw new Error("Existing admin sign-in failed");
                  await api("bootstrap", {
                    email: fields.email,
                    name: fields.name,
                    password: fields.password,
                    adminToken: admin.token,
                  });
                  setLoginMode("login");
                  setNotice(
                    "Owner created. Sign in with your new support credentials.",
                  );
                } else {
                  const result = await api<{ staff: Staff }>(loginMode, {
                    ...fields,
                    token: invite,
                  });
                  setStaff(result.staff);
                  setInvite("");
                }
              });
            }}
          >
            {loginMode === "bootstrap" && (
              <>
                <label>
                  Existing admin ID
                  <input name="adminId" required autoComplete="off" />
                </label>
                <label>
                  Existing admin password
                  <input
                    name="adminPassword"
                    type="password"
                    required
                    autoComplete="off"
                  />
                </label>
                <label>
                  Your name
                  <input name="name" required />
                </label>
              </>
            )}
            {loginMode !== "activate" && (
              <label>
                Work email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                />
              </label>
            )}
            <label>
              {loginMode === "login"
                ? "Password"
                : "New support password · at least 12 characters"}
              <input
                name="password"
                type="password"
                minLength={loginMode === "login" ? 1 : 12}
                required
                autoComplete={
                  loginMode === "login" ? "current-password" : "new-password"
                }
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : loginMode === "login"
                  ? "Sign in"
                  : loginMode === "activate"
                    ? "Activate account"
                    : "Create owner account"}
              <ArrowRight size={16} />
            </button>
          </form>
          {notice && (
            <div role="status" className="support-notice">
              {notice}
            </div>
          )}
          {loginMode !== "activate" && (
            <button
              className="link"
              onClick={() =>
                setLoginMode(loginMode === "bootstrap" ? "login" : "bootstrap")
              }
            >
              {loginMode === "bootstrap"
                ? "Back to sign in"
                : "First-time owner setup"}
            </button>
          )}
          <footer>team.astrorekha@gmail.com only</footer>
        </section>
      </main>
    );
  return (
    <main className="support-root">
      <aside className="support-sidebar">
        <a href="/support" className="support-brand">
          <ShieldCheck />
          <span>
            AstroRekha<small>SUPPORT WORKSPACE</small>
          </span>
        </a>
        <div className="support-nav">
          {[
            ["customers", "Customer recovery", Search],
            ["cases", "Support cases", Inbox],
            ["approvals", "Approvals & activity", ClipboardCheck],
            ["access", "Team & Codex", Users],
          ].map(([key, label, Icon]) => (
            <button
              key={String(key)}
              className={tab === key ? "selected" : ""}
              onClick={() => {
                setTab(String(key));
                if (key === "access")
                  void run(async () => {
                    setTokens(
                      (await api<{ tokens: Token[] }>("tokens")).tokens,
                    );
                    if (staff.role === "owner")
                      setTeam((await api<{ staff: Staff[] }>("team")).staff);
                  });
              }}
            >
              <Icon size={19} />
              {String(label)}
            </button>
          ))}
        </div>
        <div className="support-sidebar-bottom">
          <strong>{staff.name}</strong>
          <small>
            {staff.role === "owner" ? "Workspace owner" : "Customer support"}
          </small>
          <button
            onClick={() =>
              void run(async () => {
                await api("logout", {});
                setStaff(null);
                setCustomer(null);
                setSecret("");
              })
            }
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="support-main">
        <header className="support-topbar">
          <span>
            <span className="support-dot" /> Website support
          </span>
          <span>team.astrorekha@gmail.com</span>
        </header>
        <div className="support-content">
          <div className="support-title">
            <div>
              <p className="eyebrow">SUPPORT OPERATIONS</p>
              <h1>
                {tab === "customers"
                  ? "Find it. Fix it. Verify it."
                  : tab === "cases"
                    ? "Every conversation, in context."
                    : tab === "approvals"
                      ? "Review changes with confidence."
                      : "Your team, with the right access."}
              </h1>
              <p>
                {tab === "customers"
                  ? "Payments, saved details and reports in one customer view."
                  : "Repairs stay accountable. Customer replies stay under human review."}
              </p>
            </div>
            <button onClick={() => void run(refresh)} disabled={busy}>
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
          {notice && (
            <div role="status" className="support-notice">
              <AlertCircle size={18} />
              {notice}
              <button onClick={() => setNotice("")}>Dismiss</button>
            </div>
          )}
          {busy && (
            <div role="status" className="support-progress">
              Working… Report recovery may take a few minutes. Keep this page
              open.
            </div>
          )}
          {tab === "customers" && (
            <>
              <form
                className="support-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const result = await api<{
                      customers: Snapshot["user"][];
                      payments: Snapshot["payments"];
                    }>(`search?q=${encodeURIComponent(search.trim())}`);
                    setMatches(result.customers);
                    setSearchPayments(result.payments);
                    setActiveCase(null);
                    setDraft("");
                    if (result.customers.length === 1)
                      await loadCustomer(result.customers[0].id);
                    else setCustomer(null);
                    if (!result.customers.length && !result.payments.length)
                      setNotice(
                        "No exact match. Try the payment reference, phone number, saved email or user ID.",
                      );
                  });
                }}
              >
                <Search size={20} />
                <input
                  aria-label="Customer search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Email, phone, user ID or payment reference"
                  required
                />
                <button className="primary" disabled={busy}>
                  Find customer
                </button>
              </form>
              {matches.length > 1 && (
                <section className="support-panel">
                  <h2>Matching accounts</h2>
                  <p>
                    Review identity and payment evidence before selecting an
                    account.
                  </p>
                  {matches.map((u) => (
                    <button
                      className="support-match"
                      key={u.id}
                      onClick={() => void run(() => loadCustomer(u.id))}
                    >
                      <span>
                        {u.name} · {u.email}
                        <small>{u.id}</small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </section>
              )}
              {!customer && searchPayments.length > 0 && (
                <section className="support-panel">
                  <h2>Payment matches</h2>
                  {searchPayments.map((p) => (
                    <p key={p.id}>
                      {p.id} · {p.customer_email} ·{" "}
                      {p.user_id || "No assigned account"}
                    </p>
                  ))}
                  <p>
                    Use the exact customer email to select the account.
                    Unassigned payments require an owner-approved mapping
                    request.
                  </p>
                </section>
              )}
              {!customer && (
                <section className="support-empty">
                  <Search size={40} />
                  <h2>Start with the customer or payment</h2>
                  <p>
                    Search exact records, review the full Gmail conversation,
                    and attach the issue to a support case.
                  </p>
                  <div className="support-steps">
                    <span>01 · Find saved data</span>
                    <span>02 · Apply verified repairs</span>
                    <span>03 · Prepare a reviewed reply</span>
                  </div>
                </section>
              )}
              {customer && (
                <>
                  <section className="support-customer">
                    <div className="support-avatar">
                      {String(customer.user.name || "C").slice(0, 1)}
                    </div>
                    <div>
                      <h2>{customer.user.name || "Customer"}</h2>
                      <p>{customer.user.email}</p>
                      <small>{customer.user.id}</small>
                    </div>
                    <div className="support-balance">
                      <strong>{customer.user.coins || 0}</strong>
                      <span>coins available</span>
                    </div>
                  </section>
                  <div className="support-grid">
                    <section className="support-panel">
                      <h2>Case context</h2>
                      <p>
                        {activeCase?.subject ||
                          "Record the customer’s issue before making changes."}
                      </p>
                      <label>
                        Issue and supporting evidence
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={3}
                          placeholder="What did the customer report? Which saved details or receipt confirm the correction?"
                        />
                      </label>
                      {!activeCase && (
                        <form
                          onSubmit={(e) => {
                            const f = form(e);
                            void run(async () => {
                              const c = await api<Case>("cases", {
                                customerId: customer.user.id,
                                subject: f.subject,
                                issue: reason,
                                threadId: f.threadId || undefined,
                              });
                              setActiveCase(c);
                              await refresh();
                            });
                          }}
                        >
                          <input
                            name="subject"
                            placeholder="Case subject"
                            aria-label="Case subject"
                            required
                          />
                          <input
                            name="threadId"
                            placeholder="Gmail thread ID (optional)"
                            aria-label="Gmail thread ID"
                          />
                          <button disabled={busy || !reason}>
                            Create support case
                          </button>
                        </form>
                      )}
                      {activeCase && (
                        <small>
                          Case {activeCase.id} ·{" "}
                          {activeCase.status.replaceAll("_", " ")}
                          <span className="support-row">
                            <button
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await api(`cases/${activeCase.id}`, {
                                    issue: reason,
                                  });
                                  setNotice("Case notes saved.");
                                  await refresh();
                                })
                              }
                            >
                              Save case notes
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  const status =
                                    activeCase.status === "resolved"
                                      ? "open"
                                      : "resolved";
                                  await api(`cases/${activeCase.id}`, {
                                    status,
                                    reviewConfirmed: true,
                                  });
                                  setActiveCase({ ...activeCase, status });
                                  await refresh();
                                })
                              }
                            >
                              {activeCase.status === "resolved"
                                ? "Reopen case"
                                : "Mark reviewed & resolved"}
                            </button>
                          </span>
                        </small>
                      )}
                    </section>
                    <section className="support-panel">
                      <h2>Saved birth details</h2>
                      <dl>
                        <dt>Date</dt>
                        <dd>
                          {customer.profile?.birth_day ||
                            customer.user.birth_day}{" "}
                          /{" "}
                          {customer.profile?.birth_month ||
                            customer.user.birth_month}{" "}
                          /{" "}
                          {customer.profile?.birth_year ||
                            customer.user.birth_year}
                        </dd>
                        <dt>Time</dt>
                        <dd>
                          {customer.profile?.birth_hour ||
                            customer.user.birth_hour}
                          :
                          {customer.profile?.birth_minute ||
                            customer.user.birth_minute}{" "}
                          {customer.profile?.birth_period ||
                            customer.user.birth_period}
                        </dd>
                        <dt>Place</dt>
                        <dd>
                          {customer.profile?.birth_place ||
                            customer.user.birth_place ||
                            "Missing"}
                        </dd>
                      </dl>
                      <details>
                        <summary>Correct birth details</summary>
                        <form
                          onSubmit={(e) => {
                            const f = form(e);
                            void run(() => repair("correct_birth", f));
                          }}
                        >
                          <label>
                            Date
                            <input name="date" type="date" required />
                          </label>
                          <label>
                            Birth time
                            <input name="time" type="time" required />
                          </label>
                          <label>
                            Birthplace
                            <input
                              name="place"
                              required
                              placeholder="City, state, country"
                            />
                          </label>
                          <p>
                            Recalculates signs and marks birth-based reports for
                            recovery. Recover those reports before drafting.
                          </p>
                          <button disabled={busy}>
                            Save verified correction
                          </button>
                        </form>
                      </details>
                    </section>
                  </div>
                  <section className="support-panel">
                    <div className="support-section-heading">
                      <h2>Reports & saved inputs</h2>
                      <label className="support-check">
                        <input
                          type="checkbox"
                          checked={force}
                          onChange={(e) => setForce(e.target.checked)}
                        />
                        Regenerate an existing report
                      </label>
                    </div>
                    <div className="support-report-grid">
                      {customer.reports.map((r) => (
                        <article key={r.key} className="support-report">
                          <div>
                            <FileText size={19} />
                            <span
                              className={`support-badge ${r.ready ? "good" : !r.unlocked ? "muted" : "warn"}`}
                            >
                              {r.ready
                                ? "Verified saved"
                                : !r.unlocked
                                  ? "Not purchased"
                                  : r.status}
                            </span>
                          </div>
                          <h3>{r.name}</h3>
                          <p>
                            {r.savedInputs === true
                              ? "Saved inputs found"
                              : r.savedInputs === false
                                ? "Check saved inputs"
                                : r.generatedAt
                                  ? `Saved ${date(r.generatedAt)}`
                                  : "No completed result yet"}
                          </p>
                          <button
                            disabled={busy || !r.unlocked}
                            onClick={() =>
                              void run(() =>
                                repair("recover_report", {
                                  report: r.key,
                                  force,
                                }),
                              )
                            }
                          >
                            {r.ready && !force
                              ? "Verify existing report"
                              : "Recover report"}
                            <ArrowRight size={14} />
                          </button>
                        </article>
                      ))}
                    </div>
                    <p className="support-footnote">
                      Recovery uses saved customer data. Unsupported or
                      ambiguous cases remain open for review. No PDFs are
                      created.
                    </p>
                  </section>
                  <section className="support-panel">
                    <h2>Payments & access</h2>
                    <div className="support-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Order / gateway reference</th>
                            <th>Purchase</th>
                            <th>Amount</th>
                            <th>Saved status</th>
                            <th>Recovery</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customer.payments.map((p) => (
                            <tr key={p.id}>
                              <td>
                                {p.id}
                                <small>
                                  {p.payu_payment_id ||
                                    p.gateway_transaction_id ||
                                    p.gateway}
                                </small>
                              </td>
                              <td>{p.bundle_id || p.feature || p.type}</td>
                              <td>
                                {p.currency || "INR"}{" "}
                                {(p.amount / 100).toFixed(2)}
                              </td>
                              <td>
                                {p.payment_status}
                                <small>
                                  {p.fulfilled_at ? "Fulfilled" : "Unfulfilled"}
                                </small>
                              </td>
                              <td>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void run(() =>
                                      repair("reconcile_payment", {
                                        paymentId: p.id,
                                      }),
                                    )
                                  }
                                >
                                  Verify & reconcile
                                </button>
                                <button
                                  disabled={busy || !p.fulfilled_at}
                                  onClick={() =>
                                    void run(() =>
                                      repair("restore_access", {
                                        paymentId: p.id,
                                      }),
                                    )
                                  }
                                >
                                  Restore access
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!customer.payments.length && (
                        <p>
                          No payment rows are currently assigned. Search other
                          references before concluding that no payment exists.
                        </p>
                      )}
                    </div>
                    <details>
                      <summary>Request payment mapping</summary>
                      <p>
                        Owner approval and gateway verification are required.
                        Payments already assigned elsewhere are blocked for
                        investigation.
                      </p>
                      <form
                        onSubmit={(e) => {
                          const f = form(e);
                          void run(() => repair("link_payment", f));
                        }}
                      >
                        <input
                          name="paymentId"
                          placeholder="Existing payment ID"
                          required
                        />
                        <button disabled={busy}>Request mapping</button>
                      </form>
                    </details>
                  </section>
                  <div className="support-grid">
                    <section className="support-panel">
                      <h2>Account corrections</h2>
                      <p>
                        Sign-in method:{" "}
                        {customer.login.passwordConfigured
                          ? "Password or email code"
                          : "Email code"}
                      </p>
                      <small>
                        {customer.login.codeRequestedAt
                          ? `Last code requested ${date(customer.login.codeRequestedAt)}. Delivery has not been verified.`
                          : "No active email-code record. This does not prove that no code was previously sent."}
                      </small>
                      <details>
                        <summary>Correct email · owner approval</summary>
                        <form
                          onSubmit={(e) => {
                            const f = form(e);
                            void run(() => repair("change_email", f));
                          }}
                        >
                          <input
                            name="email"
                            type="email"
                            required
                            placeholder="Correct email"
                          />
                          <button disabled={busy}>
                            Request email correction
                          </button>
                        </form>
                      </details>
                      <details>
                        <summary>Add questions · owner approval</summary>
                        <form
                          onSubmit={(e) => {
                            const f = form(e);
                            void run(() => repair("add_questions", f));
                          }}
                        >
                          <input
                            name="questions"
                            type="number"
                            min="1"
                            max="100"
                            required
                            placeholder="Number of questions"
                          />
                          <button disabled={busy}>Request compensation</button>
                        </form>
                      </details>
                      <details>
                        <summary>
                          Grant additional access · owner approval
                        </summary>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void run(() =>
                              repair("grant_features", {
                                features: f.getAll("features"),
                              }),
                            );
                          }}
                        >
                          {FEATURES.map((f) => (
                            <label className="support-check" key={f}>
                              <input
                                name="features"
                                type="checkbox"
                                value={f}
                              />
                              {f}
                            </label>
                          ))}
                          <button disabled={busy}>Request access grant</button>
                        </form>
                      </details>
                      <details>
                        <summary>Reset Aura Color quiz</summary>
                        <p>
                          The saved quiz result is retained in the repair audit
                          before resetting the quiz.
                        </p>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              repair("reset_quiz", {
                                report: "auraColorReport",
                              }),
                            )
                          }
                        >
                          Reset quiz for retake
                        </button>
                      </details>
                    </section>
                    <section className="support-panel">
                      <h2>Reply for support review</h2>
                      <p>
                        Choose only the reports relevant to this conversation.
                        Read earlier replies before preparing another login
                        message.
                      </p>
                      {customer.reports
                        .filter((r) => r.ready)
                        .map((r) => (
                          <label className="support-check" key={r.key}>
                            <input
                              type="checkbox"
                              checked={selectedReports.includes(r.key)}
                              onChange={(e) =>
                                setSelectedReports(
                                  e.target.checked
                                    ? [...selectedReports, r.key]
                                    : selectedReports.filter(
                                        (k) => k !== r.key,
                                      ),
                                )
                              }
                            />
                            {r.name}
                          </label>
                        ))}
                      <button
                        disabled={
                          busy || !activeCase || !selectedReports.length
                        }
                        onClick={() =>
                          void run(async () => {
                            const x = await api<{ draft: string }>(
                              `cases/${activeCase!.id}`,
                              {
                                generateDraft: true,
                                reportKeys: selectedReports,
                              },
                            );
                            setDraft(x.draft);
                            setActiveCase({
                              ...activeCase!,
                              status: "ready_for_review",
                            });
                            await refresh();
                          })
                        }
                      >
                        <FileText size={16} />
                        Prepare verified reply
                      </button>
                      <textarea
                        aria-label="Reply text"
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          if (activeCase)
                            setActiveCase({ ...activeCase, status: "open" });
                        }}
                        rows={12}
                        placeholder={
                          activeCase
                            ? "Your reply will appear here."
                            : "Create a support case to prepare a reply."
                        }
                      />
                      <div className="support-row">
                        <button
                          disabled={busy || !draft || !activeCase}
                          onClick={() =>
                            void run(async () => {
                              await api(`cases/${activeCase!.id}`, {
                                draft,
                                reportKeys: selectedReports,
                              });
                              setActiveCase({
                                ...activeCase!,
                                status: "ready_for_review",
                              });
                              setNotice(
                                "Reply saved in this support case. Use the connected Gmail workflow to save the unsent email draft.",
                              );
                              await refresh();
                            })
                          }
                        >
                          Save reply
                        </button>
                        <button
                          disabled={
                            !draft || activeCase?.status !== "ready_for_review"
                          }
                          onClick={() =>
                            void run(async () => {
                              await navigator.clipboard.writeText(draft);
                              setNotice("Reply copied.");
                            })
                          }
                        >
                          Copy reply
                        </button>
                      </div>
                      <small>
                        Saved here, not sent. Connected Codex saves the Gmail
                        draft, adds For Santushti, removes Completed and marks
                        the handled thread as read.
                      </small>
                    </section>
                  </div>
                  <section className="support-panel">
                    <h2>Saved payment evidence</h2>
                    <p>
                      Review saved birth details and linked IDs before asking
                      the customer to provide information again.
                    </p>
                    {customer.evidence.map((e) => (
                      <details key={e.id}>
                        <summary>
                          {e.id} · {e.user_id || "Unassigned"}
                        </summary>
                        <pre>
                          {JSON.stringify(e.birth_details_snapshot, null, 2) ||
                            "No birth snapshot saved"}
                        </pre>
                      </details>
                    ))}
                  </section>
                  <section className="support-panel">
                    <h2>Customer action history</h2>
                    {customer.actions.map((a) => (
                      <div className="support-history" key={a.id}>
                        <span className="support-badge">
                          {a.status.replaceAll("_", " ")}
                        </span>
                        <div>
                          <strong>{a.kind.replaceAll("_", " ")}</strong>
                          <p>{a.reason}</p>
                          <small>{date(a.created_at)}</small>
                        </div>
                      </div>
                    ))}
                  </section>
                </>
              )}
            </>
          )}
          {tab === "cases" && (
            <section className="support-panel">
              <h2>Recent support cases</h2>
              <p>
                Cases created here or imported by the connected Gmail workflow.
                No emails are automatically sent.
              </p>
              {cases.map((c) => (
                <button
                  className="support-match"
                  key={c.id}
                  onClick={() => void run(() => openCase(c))}
                >
                  <span>
                    <strong>{c.subject}</strong>
                    <small>
                      {c.status.replaceAll("_", " ")} · {date(c.updated_at)}
                    </small>
                    {c.issue.slice(0, 160)}
                  </span>
                  <ArrowRight size={18} />
                </button>
              ))}
              {cases.length >= 100 && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await api<{ cases: Case[] }>(
                        `cases?offset=${cases.length}`,
                      );
                      setCases((previous) =>
                        Array.from(
                          new Map(
                            [...previous, ...result.cases].map((c) => [
                              c.id,
                              c,
                            ]),
                          ).values(),
                        ),
                      );
                      if (!result.cases.length) setNotice("No older cases.");
                    })
                  }
                >
                  Load older cases
                </button>
              )}
              {!cases.length && (
                <div className="support-empty">
                  <Inbox size={35} />
                  <h3>No cases yet</h3>
                  <p>
                    Find a customer to create the first case, or import a thread
                    through connected Codex.
                  </p>
                </div>
              )}
            </section>
          )}
          {tab === "approvals" && (
            <section className="support-panel">
              <h2>Repair requests & activity</h2>
              {actions.map((a) => (
                <article className="support-approval" key={a.id}>
                  <div className="support-section-heading">
                    <h3>{a.kind.replaceAll("_", " ")}</h3>
                    <span className="support-badge">
                      {a.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p>{a.reason}</p>
                  <small>
                    {a.customer_id} · {date(a.created_at)}
                  </small>
                  <pre>{JSON.stringify(a.payload, null, 2)}</pre>
                  {typeof a.result?.message === "string" && (
                    <p>{String(a.result.message)}</p>
                  )}
                  <div className="support-row">
                    <button
                      onClick={() =>
                        void run(async () => {
                          await loadCustomer(a.customer_id);
                          setTab("customers");
                        })
                      }
                    >
                      Review customer
                    </button>
                    {a.status === "awaiting_approval" &&
                      staff.role === "owner" && (
                        <>
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await api(`actions/${a.id}`, {
                                  decision: "approve",
                                });
                                await refresh();
                              })
                            }
                          >
                            Approve & apply
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await api(`actions/${a.id}`, {
                                  decision: "reject",
                                });
                                await refresh();
                              })
                            }
                          >
                            Reject
                          </button>
                        </>
                      )}
                    {a.status === "running" && staff.role === "owner" && (
                      <button
                        disabled={
                          busy || Date.now() - Date.parse(a.created_at) < 600000
                        }
                        onClick={() =>
                          void run(async () => {
                            await api(`actions/${a.id}`, {
                              decision: "release",
                            });
                            await refresh();
                          })
                        }
                      >
                        Review interrupted repair
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {actions.length >= 100 && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await api<{ actions: Action[] }>(
                        `actions?offset=${actions.length}`,
                      );
                      setActions((previous) =>
                        Array.from(
                          new Map(
                            [...previous, ...result.actions].map((a) => [
                              a.id,
                              a,
                            ]),
                          ).values(),
                        ),
                      );
                      if (!result.actions.length)
                        setNotice("No older actions.");
                    })
                  }
                >
                  Load older actions
                </button>
              )}
              {!actions.length && <p>No repair requests yet.</p>}
            </section>
          )}
          {tab === "access" && (
            <div className="support-grid">
              {staff.role === "owner" && (
                <section className="support-panel">
                  <h2>Staff access</h2>
                  <p>
                    Each teammate gets their own account. Invitations expire
                    after 24 hours.
                  </p>
                  <form
                    onSubmit={(e) => {
                      const f = form(e);
                      void run(async () => {
                        const result = await api<{ invitationUrl: string }>(
                          "team",
                          f,
                        );
                        setSecret(result.invitationUrl);
                        setTeam((await api<{ staff: Staff[] }>("team")).staff);
                      });
                    }}
                  >
                    <label>
                      Name
                      <input name="name" required />
                    </label>
                    <label>
                      Email
                      <input name="email" type="email" required />
                    </label>
                    <button disabled={busy}>Create invitation</button>
                  </form>
                  {team.map((t) => (
                    <div className="support-history" key={t.id}>
                      <div>
                        <strong>{t.name}</strong>
                        <small>
                          {t.email} · {t.role} ·{" "}
                          {t.active ? "Active" : "Disabled"}
                        </small>
                      </div>
                      {t.id !== staff.id && t.active && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await api("team", { staffId: t.id });
                              setTeam(
                                (await api<{ staff: Staff[] }>("team")).staff,
                              );
                            })
                          }
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              )}
              <section className="support-panel">
                <h2>
                  <KeyRound size={20} /> Codex access
                </h2>
                <p>
                  Use a personal support token with the support API. It cannot
                  approve sensitive repairs or access production credentials.
                  Tokens expire after 30 days.
                </p>
                <form
                  onSubmit={(e) => {
                    const f = form(e);
                    void run(async () => {
                      const result = await api<{ token: string }>("tokens", f);
                      setSecret(result.token);
                      setTokens(
                        (await api<{ tokens: Token[] }>("tokens")).tokens,
                      );
                    });
                  }}
                >
                  <label>
                    Token name
                    <input
                      name="name"
                      required
                      placeholder="Santushti’s Codex"
                    />
                  </label>
                  <button disabled={busy}>Create scoped token</button>
                </form>
                {tokens.map((t) => (
                  <div className="support-history" key={t.token_hash}>
                    <div>
                      <strong>{t.name}</strong>
                      <small>Expires {date(t.expires_at)}</small>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api("tokens", { revoke: t.token_hash });
                          setTokens(
                            (await api<{ tokens: Token[] }>("tokens")).tokens,
                          );
                        })
                      }
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </section>
              <section className="support-panel">
                <h2>
                  <CheckCircle2 size={20} /> Gmail handoff
                </h2>
                <p>
                  Connect only <strong>team.astrorekha@gmail.com</strong> in
                  Codex. Use the support runbook and this API to investigate and
                  fix cases.
                </p>
                <ol>
                  <li>Read the entire thread, including earlier replies.</li>
                  <li>Verify the customer and apply repairs here.</li>
                  <li>
                    Save a concise, unsent Gmail draft for specific issues.
                  </li>
                  <li>
                    Apply For Santushti, remove Completed, then mark read.
                  </li>
                  <li>
                    Use For Santushti/Login for routine payment/login cases.
                  </li>
                </ol>
                <p>Sending remains a human support action in Gmail.</p>
              </section>
            </div>
          )}
          {secret && (
            <section className="support-panel support-secret">
              <h2>Copy once, then close</h2>
              <p>
                Share an invitation directly with the teammate. Store API tokens
                in their local secret store.
              </p>
              <textarea
                aria-label="One-time credential"
                readOnly
                value={secret}
              />
              <div className="support-row">
                <button
                  onClick={() =>
                    void run(async () => {
                      await navigator.clipboard.writeText(secret);
                      setNotice("Copied.");
                    })
                  }
                >
                  Copy
                </button>
                <button onClick={() => setSecret("")}>Close and hide</button>
              </div>
            </section>
          )}
          <footer className="support-footer">
            <ShieldCheck size={14} /> Audited repairs · Owner-approved sensitive
            changes · Human-reviewed replies
          </footer>
        </div>
      </div>
    </main>
  );
}
