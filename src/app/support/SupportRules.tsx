"use client";
import { useEffect, useState } from "react";
import { FileText, History, RefreshCw, ShieldCheck } from "lucide-react";
import {
  DEFAULT_RULE_SETTINGS,
  REPLY_TOPICS,
  SUPPORT_SAFEGUARDS,
  type RuleSettings,
  type RuleVersion,
} from "@/lib/support/rules-config";
async function request<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/support/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Could not load support rules");
  return data;
}
export default function SupportRules({ owner }: { owner: boolean }) {
  const [current, setCurrent] = useState<RuleVersion | null>(null),
    [history, setHistory] = useState<RuleVersion[]>([]),
    [nextOffset, setNextOffset] = useState<number | null>(null);
  const [content, setContent] = useState(""),
    [settings, setSettings] = useState<RuleSettings>(DEFAULT_RULE_SETTINGS),
    [baseVersion, setBaseVersion] = useState(0),
    [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const accept = (v: RuleVersion) => {
    setCurrent(v);
    setContent(v.content);
    setSettings(v.settings);
    setBaseVersion(v.version);
    setNote("");
    setDirty(false);
  };
  useEffect(() => {
    let active = true;
    Promise.all([
      request<RuleVersion>("rules"),
      request<{ versions: RuleVersion[]; nextOffset: number | null }>(
        "rules/history",
      ),
    ])
      .then(([v, h]) => {
        if (active) {
          accept(v);
          setHistory(h.versions);
          setNextOffset(h.nextOffset);
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not finish");
    } finally {
      setBusy(false);
    }
  }
  const change = (
    key: keyof RuleSettings,
    value: RuleSettings[keyof RuleSettings],
  ) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setDirty(true);
  };
  return (
    <section className="support-rules">
      <div className="support-panel">
        <div className="support-section-heading">
          <div>
            <h2>
              <FileText size={20} /> Support Rules
            </h2>
            <p>
              Publish once here. Every teammate’s updated Codex client loads
              these rules before working.
            </p>
          </div>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const v = await request<RuleVersion>("rules");
                setCurrent(v);
                if (!dirty) accept(v);
                setMessage(
                  dirty
                    ? "Latest version checked. Your unpublished edits have been preserved."
                    : "Current published rules loaded.",
                );
              })
            }
          >
            <RefreshCw size={16} /> Check latest
          </button>
        </div>
        {message && (
          <p role="status" className="support-notice">
            {message}
          </p>
        )}
        {!current ? (
          <p>Loading published rules…</p>
        ) : (
          <>
            <div className="support-rules-meta">
              <strong>Live version {current.version}</strong>
              <span>
                {new Date(current.published_at).toLocaleString("en-IN")} ·{" "}
                {current.published_by}
              </span>
              {dirty && <strong>Unpublished changes</strong>}
            </div>
            {dirty && baseVersion !== current.version && (
              <p role="alert">
                A newer version is live. Review it below before publishing.{" "}
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Discard your unpublished edits and load the latest rules?",
                      )
                    )
                      accept(current);
                  }}
                >
                  Load latest into editor
                </button>
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const v = await request<RuleVersion>("rules", {
                    baseVersion,
                    content,
                    settings,
                    changeNote: note,
                  });
                  accept(v);
                  const h = await request<{
                    versions: RuleVersion[];
                    nextOffset: number | null;
                  }>("rules/history");
                  setHistory(h.versions);
                  setNextOffset(h.nextOffset);
                  setMessage(
                    `Version ${v.version} is live. Codex must reload it before the next customer operation.`,
                  );
                });
              }}
            >
              <label>
                Support instructions
                <textarea
                  aria-label="Support instructions"
                  className="support-rules-editor"
                  value={content}
                  readOnly={!owner}
                  maxLength={20000}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <p>
                Write the full workflow here. Use the fields below for label
                names and reply formatting; those settings are also supplied to
                Codex and used by reply preparation.
              </p>
              <div className="support-two-col">
                <label>
                  Specific-issue label
                  <input
                    value={settings.specificLabel}
                    readOnly={!owner}
                    maxLength={100}
                    onChange={(e) => change("specificLabel", e.target.value)}
                  />
                </label>
                <label>
                  Routine login label
                  <input
                    value={settings.loginLabel}
                    readOnly={!owner}
                    maxLength={100}
                    onChange={(e) => change("loginLabel", e.target.value)}
                  />
                </label>
                <label>
                  Completed label to remove
                  <input
                    value={settings.completedLabel}
                    readOnly={!owner}
                    maxLength={100}
                    onChange={(e) => change("completedLabel", e.target.value)}
                  />
                </label>
              </div>
              <p>
                Enter existing Gmail label names. Publishing does not create,
                rename or relabel messages.
              </p>
              <label>
                Required closing
                <textarea
                  value={settings.closing}
                  readOnly={!owner}
                  maxLength={600}
                  onChange={(e) => change("closing", e.target.value)}
                />
              </label>
              <label>
                Signature
                <textarea
                  value={settings.signature}
                  readOnly={!owner}
                  maxLength={300}
                  onChange={(e) => change("signature", e.target.value)}
                />
              </label>
              <fieldset className="support-rules-topics">
                <legend>Block these topics in prepared replies</legend>
                {Object.entries(REPLY_TOPICS).map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      disabled={!owner}
                      checked={settings.blockedTopics.includes(
                        key as keyof typeof REPLY_TOPICS,
                      )}
                      onChange={(e) =>
                        change(
                          "blockedTopics",
                          e.target.checked
                            ? [
                                ...settings.blockedTopics,
                                key as keyof typeof REPLY_TOPICS,
                              ]
                            : settings.blockedTopics.filter((t) => t !== key),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              {owner ? (
                <>
                  <label>
                    What changed?
                    <input
                      aria-label="Change note"
                      placeholder="For example: updated follow-up reply instructions"
                      value={note}
                      required
                      maxLength={300}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !dirty ||
                      !note.trim() ||
                      content.trim().length < 100
                    }
                  >
                    Publish rules
                  </button>
                </>
              ) : (
                <p>
                  Only an owner signed into the dashboard can publish changes.
                  Staff and Codex tokens have read-only access.
                </p>
              )}
            </form>
          </>
        )}
      </div>
      <div className="support-panel">
        <h2>
          <ShieldCheck size={20} /> Permissions that stay enforced
        </h2>
        <p>
          <a href="/downloads/astrorekha-support-kit.zip" download>
            Download the updated Support Kit
          </a>{" "}
          once on each teammate’s computer. Preserve their existing .env.support
          file.
        </p>
        <ul>
          {SUPPORT_SAFEGUARDS.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p>
          Codex must refresh before each Gmail run and before draft or label
          changes. The API blocks stale customer operations. Gmail itself is a
          separate connector, so its handling follows the published
          instructions.
        </p>
        <p>
          After the one-time kit update, teammates run{" "}
          <code>node scripts/support/client.mjs start</code> to read the current
          version. Existing tokens continue to work.
        </p>
      </div>
      <div className="support-panel">
        <h2>
          <History size={20} /> Version history
        </h2>
        <p>
          Published versions cannot be edited. To restore an older policy, load
          it into the editor and publish a new version.
        </p>
        {history.map((v) => (
          <details key={v.version} className="support-rules-version">
            <summary>
              Version {v.version} · {v.change_note}
            </summary>
            <p>
              {v.published_by} ·{" "}
              {new Date(v.published_at).toLocaleString("en-IN")}
            </p>
            <pre>{v.content}</pre>
            <dl className="support-rule-settings-history">
              <dt>Specific-issue label</dt>
              <dd>{v.settings.specificLabel}</dd>
              <dt>Routine login label</dt>
              <dd>{v.settings.loginLabel}</dd>
              <dt>Completed label to remove</dt>
              <dd>{v.settings.completedLabel}</dd>
              <dt>Required closing</dt>
              <dd>{v.settings.closing}</dd>
              <dt>Signature</dt>
              <dd>{v.settings.signature}</dd>
              <dt>Blocked reply topics</dt>
              <dd>
                {v.settings.blockedTopics
                  .map((topic) => REPLY_TOPICS[topic])
                  .join(", ") || "None"}
              </dd>
            </dl>
            {owner && (
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    dirty &&
                    !window.confirm(
                      "Replace your unpublished edits with this version?",
                    )
                  )
                    return;
                  setContent(v.content);
                  setSettings(v.settings);
                  setBaseVersion(current?.version || v.version);
                  setNote(`Restore instructions from version ${v.version}`);
                  setDirty(true);
                  setMessage(
                    `Version ${v.version} loaded into the editor. Review and publish to make it live.`,
                  );
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Use version {v.version} in editor
              </button>
            )}
          </details>
        ))}
        {nextOffset !== null && (
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const h = await request<{
                  versions: RuleVersion[];
                  nextOffset: number | null;
                }>(`rules/history?offset=${nextOffset}`);
                setHistory((old) =>
                  Array.from(
                    new Map(
                      [...old, ...h.versions].map((v) => [v.version, v]),
                    ).values(),
                  ),
                );
                setNextOffset(h.nextOffset);
              })
            }
          >
            Load older versions
          </button>
        )}
      </div>
    </section>
  );
}
