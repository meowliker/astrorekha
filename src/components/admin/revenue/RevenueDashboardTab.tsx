"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowUpDown,
  RefreshCw,
  Check,
  Download,
  Info,
  Loader2,
  Search,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  istDate,
  ratio,
  shiftDate,
  type ProductMetric,
  type RevenueDashboard,
  type RevenueOrder,
} from "@/lib/revenue-dashboard";
import styles from "./revenue.module.css";
import RevenueDateRange from "./RevenueDateRange";
import { compareValues, type SortDirection } from "@/lib/revenue-table";

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
const number = (value: number) => new Intl.NumberFormat("en-IN").format(value);
const percent = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(2)}%`;
const shortDate = (value: string) =>
  new Date(`${value}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
const dateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
const tabs = ["Overview", "Bundles", "Add-ons", "Coins", "Reports"] as const;
type Tab = (typeof tabs)[number];

function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={`${styles.metric} ${accent ? styles.accentMetric : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}
type CellValue = string | number | null | undefined;
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isValidElement<{ children?: React.ReactNode }>(node))
    return textOf(node.props.children);
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: React.ReactNode }>(child)
        ? textOf(child.props.children)
        : String(child),
    )
    .join(" ");
}
function Table({
  headers,
  children,
  values,
  sort,
  onSort,
  filterLabel,
}: {
  headers: string[];
  children: React.ReactNode;
  values?: CellValue[][];
  sort?: { column: number; direction: SortDirection };
  onSort?: (column: number, direction: SortDirection) => void;
  filterLabel?: string;
}) {
  const [localSort, setLocalSort] = useState<{
    column: number;
    direction: SortDirection;
  } | null>(null);
  const [query, setQuery] = useState("");
  const active = sort || localSort;
  let rows = Children.toArray(children).map((node, index) => ({ node, index }));
  if (query)
    rows = rows.filter((row) =>
      textOf(row.node).toLowerCase().includes(query.toLowerCase()),
    );
  if (active && values && !onSort)
    rows.sort(
      (a, b) =>
        compareValues(
          values[a.index]?.[active.column],
          values[b.index]?.[active.column],
          active.direction,
        ) || a.index - b.index,
    );
  return (
    <>
      {filterLabel && (
        <label className={styles.tableSearch}>
          <Search size={15} />
          <input
            aria-label={filterLabel}
            placeholder={filterLabel}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {headers.map((label, i) => (
                <th
                  key={`${i}-${label}`}
                  scope="col"
                  aria-sort={
                    active?.column === i
                      ? active.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  {values || onSort ? (
                    <button
                      className={styles.sortButton}
                      onClick={() => {
                        const direction =
                          active?.column === i && active.direction === "asc"
                            ? "desc"
                            : "asc";
                        if (onSort) onSort(i, direction);
                        else setLocalSort({ column: i, direction });
                      }}
                    >
                      {label}
                      <span aria-hidden="true">
                        {active?.column === i ? (
                          active.direction === "asc" ? (
                            "↑"
                          ) : (
                            "↓"
                          )
                        ) : (
                          <ArrowUpDown size={12} />
                        )}
                      </span>
                    </button>
                  ) : (
                    label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows.map((row) => row.node)}</tbody>
        </table>
      </div>
      {query && !rows.length && <Empty>No rows match this search.</Empty>}
    </>
  );
}
function ProductTable({
  rows,
  showOffers = false,
  searchable = true,
}: {
  rows: ProductMetric[];
  showOffers?: boolean;
  searchable?: boolean;
}) {
  if (!rows.length) return <Empty>No products match this filter.</Empty>;
  return (
    <Table
      filterLabel={searchable ? "Filter products in table" : undefined}
      values={rows.map((p) => [
        p.name,
        p.attempts,
        p.paid,
        p.buyers,
        p.checkoutCvr,
        p.collectedPaise,
        p.refundedPaise,
        p.netPaise,
        p.viewers,
        p.convertedViewers,
        p.offerCvr,
      ])}
      headers={[
        "Product",
        "Checkouts",
        "Paid orders",
        "Buyers",
        "Checkout CVR",
        "Collected",
        "Refunds",
        "Net collected",
        ...(showOffers
          ? ["Tracked viewers", "Matched buyers", "Offer CVR"]
          : []),
      ]}
    >
      {rows.map((row) => (
        <tr key={row.key}>
          <td>
            <strong>{row.name}</strong>
            <small>
              {CATEGORY_LABELS[row.category]} · {row.id}
            </small>
          </td>
          <td>{number(row.attempts)}</td>
          <td>{number(row.paid)}</td>
          <td>{number(row.buyers)}</td>
          <td>{percent(row.checkoutCvr)}</td>
          <td>{money(row.collectedPaise)}</td>
          <td>{money(row.refundedPaise)}</td>
          <td className={styles.emphasis}>{money(row.netPaise)}</td>
          {showOffers && (
            <>
              <td>{row.viewers === null ? "—" : number(row.viewers)}</td>
              <td>
                {row.convertedViewers === null
                  ? "—"
                  : number(row.convertedViewers)}
              </td>
              <td>{percent(row.offerCvr)}</td>
            </>
          )}
        </tr>
      ))}
    </Table>
  );
}
function RevenueChart({ data }: { data: RevenueDashboard }) {
  const [selected, setSelected] = useState<number | null>(null);
  const values = data.daily.map((d) => d.netPaise);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const x = (i: number) =>
    values.length === 1 ? 450 : 45 + (i / (values.length - 1)) * 820;
  const y = (n: number) => 170 - ((n - min) / (max - min)) * 140;
  const line = values
    .map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`)
    .join(" ");
  const active = selected !== null ? data.daily[selected] : null;
  return (
    <div className={styles.chart}>
      <div className={styles.chartReadout}>
        <strong>
          {active ? money(active.netPaise) : money(data.totals.netPaise)}
        </strong>
        <span>
          {active
            ? `${shortDate(active.date)} · ${number(active.paid)} paid orders`
            : "Net collected · selected checkout dates"}
        </span>
      </div>
      <div className={styles.chartScale}>
        <span>{money(max)}</span>
        <span>Net collected</span>
      </div>
      <svg
        viewBox="0 0 900 190"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Daily net collected for selected checkout dates. Total ${money(data.totals.netPaise)}. Daily values are available in the table below.`}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="45"
              x2="865"
              y1={30 + t * 140}
              y2={30 + t * 140}
              stroke="currentColor"
              opacity=".12"
            />
          </g>
        ))}
        <path
          d={`${line} L${x(values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`}
          fill="var(--revenue-accent)"
          opacity=".07"
        />
        <path
          d={line}
          fill="none"
          stroke="var(--revenue-accent)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        {values.length === 1 && (
          <circle
            cx={x(0)}
            cy={y(values[0])}
            r="4"
            fill="var(--revenue-accent)"
          />
        )}
        {values.map((v, i) => (
          <rect
            key={i}
            x={x(i) - Math.max(3, 410 / values.length)}
            y="25"
            width={Math.max(6, 820 / values.length)}
            height="150"
            fill="transparent"
            onMouseEnter={() => setSelected(i)}
            onMouseLeave={() => setSelected(null)}
          >
            <title>
              {data.daily[i].date}: {money(v)}
            </title>
          </rect>
        ))}
      </svg>
      <div className={styles.chartDates}>
        <span>{shortDate(data.range.start)}</span>
        <span>{shortDate(data.range.end)}</span>
      </div>
    </div>
  );
}
function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
function exportOrders(orders: RevenueOrder[], start: string, end: string) {
  const columns = [
    "Order ID",
    "Gateway order",
    "Checkout time UTC",
    "Product",
    "Category",
    "Customer",
    "Status",
    "Amount INR",
    "Net collected INR",
    "Recorded coins",
    "UTM source",
    "UTM medium",
    "UTM campaign",
    "UTM content",
    "UTM term",
  ];
  const rows = orders.map((o) => [
    o.id,
    o.gatewayId,
    o.createdAt,
    o.product,
    o.category,
    o.customer,
    o.state,
    (o.amountPaise / 100).toFixed(2),
    (o.netPaise / 100).toFixed(2),
    o.coins,
    o.source,
    o.medium,
    o.campaign,
    o.content,
    o.term,
  ]);
  const url = URL.createObjectURL(
    new Blob(
      [
        "\uFEFF" +
          [columns, ...rows]
            .map((row) => row.map(csvCell).join(","))
            .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8;" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `astrorekha-orders-${start}-${end}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readOrderPage(
  data: RevenueDashboard,
  options: {
    query?: string;
    product?: string;
    state?: string;
    category?: string;
    source?: string;
    campaign?: string;
    sort?: string;
    direction?: SortDirection;
    offset?: number;
    limit?: number;
  },
  signal?: AbortSignal,
): Promise<Pick<RevenueDashboard, "orders" | "orderPage">> {
  const token = localStorage.getItem("admin_session_token");
  const params = new URLSearchParams({
    startDate: data.range.start,
    endDate: data.range.end,
    attribution: data.attribution,
    asOf: data.generatedAt,
    snapshot: data.snapshot,
    view: "orders",
    orderQuery: options.query || "",
    orderProduct: options.product || "",
    orderState: options.state || "all",
    orderCategory: options.category || "all",
    orderSource: options.source || "all",
    orderCampaign: options.campaign || "all",
    orderSort: options.sort || "createdAt",
    orderDirection: options.direction || "desc",
    orderOffset: String(options.offset || 0),
    orderLimit: String(options.limit || 50),
  });
  const response = await fetch(`/api/admin/revenue-dashboard?${params}`, {
    headers: { Authorization: `Bearer ${token || ""}` },
    cache: "no-store",
    signal,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Unable to load complete order records.");
  return result;
}

export default function RevenueDashboardTab({
  refreshSignal = 0,
}: {
  refreshSignal?: number;
}) {
  const router = useRouter();
  const [range, setRange] = useState(() => {
    const today = istDate(new Date());
    return { start: shiftDate(today, -6), end: today };
  });

  const attribution = "last";
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<RevenueDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [reportView, setReportView] = useState("performance");
  const [addOnView, setAddOnView] = useState("all");
  const [productActivity, setProductActivity] = useState("all");
  const [upsellBundle, setUpsellBundle] = useState("all");
  const lastRefresh = useRef({ revision: 0, signal: refreshSignal });
  const refreshPending = useRef(false);
  const [exportStatus, setExportStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const exportController = useRef<AbortController | null>(null);
  const [definitions, setDefinitions] = useState(false);
  const load = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    exportController.current?.abort();
    const requestedRefresh =
      revision !== lastRefresh.current.revision ||
      refreshSignal !== lastRefresh.current.signal;
    if (requestedRefresh) refreshPending.current = true;
    lastRefresh.current = { revision, signal: refreshSignal };
    async function read() {
      setLoading(true);
      setError(null);
      setData(null);
      const token = localStorage.getItem("admin_session_token");
      if (!token) {
        router.replace("/admin/login");
        return;
      }
      try {
        const params = new URLSearchParams({
          startDate: range.start,
          endDate: range.end,
          attribution,
        });
        const response = await fetch(`/api/admin/revenue-dashboard?${params}`, {
          method: refreshPending.current ? "POST" : "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          localStorage.removeItem("admin_session_token");
          router.replace("/admin/login");
          return;
        }
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Unable to load the report.");
        if (!controller.signal.aborted) {
          refreshPending.current = false;
          setData(result);
        }
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : "Unable to load the report.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void read();
    return () => controller.abort();
  }, [range, attribution, revision, refreshSignal, router]);
  const filteredProducts = useMemo(
    () =>
      data?.products.filter(
        (p) =>
          p.category === "bundle" &&
          (productActivity === "all" ||
            (productActivity === "paid"
              ? p.paid > 0
              : productActivity === "refunds"
                ? p.refundedPaise > 0
                : p.attempts > 0)) &&
          `${p.name} ${p.id}`.toLowerCase().includes(search.toLowerCase()),
      ) || [],
    [data, productActivity, search],
  );
  useEffect(() => () => exportController.current?.abort(), []);
  async function exportReport() {
    if (!data || exporting) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportStatus("Preparing complete order export…");
    try {
      const orders: RevenueOrder[] = [];
      let total = 0;
      do {
        const result = await readOrderPage(
          data,
          {
            offset: orders.length,
            limit: 2000,
          },
          controller.signal,
        );
        total = result.orderPage.total;
        if (!result.orders.length && orders.length < total)
          throw new Error(
            "Export incomplete. No file was downloaded. Please retry.",
          );
        orders.push(...result.orders);
        setExportStatus(
          `Preparing export: ${number(orders.length)} of ${number(total)} orders`,
        );
      } while (orders.length < total);
      exportOrders(orders, data.range.start, data.range.end);
      setExportStatus(`Exported ${number(orders.length)} orders.`);
    } catch (failure) {
      setExportStatus(
        controller.signal.aborted
          ? "Export canceled."
          : failure instanceof Error
            ? failure.message
            : "Export failed.",
      );
    } finally {
      setExporting(false);
    }
  }
  const switchTab = (next: Tab) => {
    setTab(next);
    setSearch("");
  };
  const totals = data?.totals;
  const upsellCohort =
    data?.upsells.cohorts.find((c) => c.id === upsellBundle) ||
    data?.upsells.cohorts[0];
  return (
    <div className={styles.dashboard}>
      <div className={styles.dashboardTools}>
        <div>
          <h2>Revenue & conversion</h2>
          <p>Payments, products and checkout performance</p>
        </div>
        <div className={styles.actions}>
          <button
            onClick={() => setDefinitions((v) => !v)}
            aria-expanded={definitions}
          >
            <Info size={15} /> Metric definitions
          </button>
          <button
            className={styles.primary}
            disabled={!data || loading || exporting}
            onClick={() => void exportReport()}
          >
            <Download size={15} /> Export payments
          </button>
        </div>
      </div>
      <div className={styles.main}>
        {exportStatus && (
          <div className={styles.exportStatus} role="status">
            {exportStatus}
            {exporting && (
              <button onClick={() => exportController.current?.abort()}>
                Cancel export
              </button>
            )}
          </div>
        )}
        <div className={styles.toolbar}>
          <div className={styles.dateForm}>
            <RevenueDateRange value={range} onChange={setRange} />
            <span className={styles.timezone}>IST · INR · 00:00–23:59</span>
          </div>
          <button onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? styles.spin : ""} />
            {loading ? "Loading…" : "Refresh data"}
          </button>
        </div>
        <div className={styles.scope}>
          <span>
            <span className={styles.statusDot} /> {shortDate(range.start)} –{" "}
            {shortDate(range.end)} · orders created in this period
          </span>
          <span>
            {data
              ? `Saved in Supabase · synced ${dateTime(data.generatedAt)} IST`
              : loading
                ? "Loading saved revenue data…"
                : "Data unavailable"}
          </span>
        </div>
        {definitions && (
          <section className={styles.definitions}>
            <h2>How this report is calculated</h2>
            <div>
              <p>
                <b>One date range.</b> IST checkout dates, with each order’s
                current recorded payment and refund status. Today ends at the
                refresh time. This is an order cohort report, not a bank
                settlement or profit report.
              </p>
              <p>
                <b>Collected → net collected.</b> Recorded successful payments
                minus completed recorded refunds. Pending refunds are shown
                separately. GST, fees and ad spend are not deducted.
              </p>
              <p>
                <b>Checkout conversion.</b> Paid orders ÷ recorded checkout
                orders, including failed and open orders. Refunded purchases
                still count as having converted. Attempts are not unique
                visitors.
              </p>
              <p>
                <b>Offer conversion.</b> Identified viewers who subsequently
                purchased that offer ÷ identified viewers, within this date
                range. Identity is joined using recorded user IDs, emails and
                visitor IDs. Missing coverage is shown as —.
              </p>
              <p>
                <b>Bundle → add-on CVR.</b> Distinct identified paid bundle
                buyers who then bought a post-bundle add-on ÷ distinct
                identified paid bundle buyers. Only payments recorded as upsells
                qualify; standalone report-store purchases are excluded. Both
                checkout dates must be inside the selected range, with the
                add-on checkout at or after the buyer’s first matching bundle
                checkout. Paid conversions include later refunds; retained-order
                CVR counts positive remaining order value. Drop-off is the share
                without an add-on purchase.
              </p>
              <p>
                <b>UTM tracking.</b> Orders show saved last-touch UTMs, falling
                back to legacy order UTMs. Unattributed does not mean organic.
              </p>
              <p>
                <b>Reports & coins.</b> Shared upsell revenue stays on the
                combination sold. Bundle prices are not split between reports.
                Purchased coins use stored order quantities. Current wallet
                balances and retained questions are shown in Coins with their
                coverage; exact coin debits cannot be inferred from chat
                history.
              </p>
              <p>
                <b>Saved data.</b> Reports calculate from the last complete
                snapshot saved in private Supabase storage. Date changes,
                sorting and filters reuse it. Refresh data rereads recorded
                payments and tracking, then saves a new snapshot. It does not
                query payment gateways.
              </p>
              <p>
                <b>Recorded truth.</b> Records are reconciled by gateway order.
                Existing legacy backfills may contain fallback values; this
                dashboard does not independently verify gateway settlements or
                reconstruct missing history.
              </p>
            </div>
          </section>
        )}
        <nav className={styles.tabs} aria-label="Revenue sections">
          {tabs.map((t) => (
            <button
              key={t}
              className={tab === t ? styles.activeTab : ""}
              onClick={() => switchTab(t)}
              aria-current={tab === t ? "page" : undefined}
            >
              {t}
            </button>
          ))}
        </nav>
        {loading && (
          <div className={styles.loading} role="status">
            <Loader2 className={styles.spin} size={24} />
            <h2>Loading revenue data</h2>
            <p>
              Reading the saved snapshot. First load and Refresh sync payment
              history.
            </p>
          </div>
        )}
        {error && (
          <div className={styles.error} role="alert">
            <h2>Report could not be loaded</h2>
            <p>{error}</p>
            <button onClick={load}>Try again</button>
          </div>
        )}
        {data && totals && (
          <div className={styles.content}>
            <div className={styles.metrics}>
              <Metric
                label="Net collected"
                value={money(totals.netPaise)}
                detail={`${money(totals.collectedPaise)} collected before refunds`}
                accent
              />
              <Metric
                label="Paid orders"
                value={number(totals.paid)}
                detail={`${number(totals.attempts)} checkout attempts`}
              />
              <Metric
                label="Checkout conversion"
                value={percent(totals.checkoutCvr)}
                detail={`${number(totals.paid)} paid ÷ ${number(totals.attempts)} checkouts`}
              />
              <Metric
                label="Average paid order"
                value={
                  totals.paid ? money(totals.collectedPaise / totals.paid) : "—"
                }
                detail="Collected ÷ paid orders · before refunds"
              />
              <Metric
                label="Paying customers"
                value={number(totals.buyers)}
                detail="Distinct identified buyers in this period"
              />
            </div>
            {data.quality.warnings.length > 0 && (
              <details className={styles.quality}>
                <summary>
                  <Info size={15} />
                  {data.quality.warnings.length} data notes · review coverage
                  and exceptions
                </summary>
                <ul>
                  {data.quality.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
            {totals.attempts === 0 && (
              <Empty>
                No recorded checkouts in this date range. Try a wider range.
              </Empty>
            )}
            {tab === "Overview" && (
              <>
                <div className={styles.overviewGrid}>
                  <Section
                    title="Revenue over time"
                    description="Net collected, grouped by the original checkout date."
                  >
                    <RevenueChart data={data} />
                  </Section>
                  <Section
                    title="Revenue mix"
                    description="Every product category reconciles to the total."
                  >
                    <div className={styles.mix}>
                      {data.categories.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => {
                            switchTab(
                              c.key === "bundle"
                                ? "Bundles"
                                : c.key === "upsell"
                                  ? "Add-ons"
                                  : c.key === "coins" || c.key === "chat_pass"
                                    ? "Coins"
                                    : "Reports",
                            );
                          }}
                        >
                          <span>
                            {c.name}
                            <small>{number(c.paid)} paid orders</small>
                          </span>
                          <strong>{money(c.netPaise)}</strong>
                          <span className={styles.mixTrack}>
                            <span
                              style={{
                                width: `${Math.max(0, Math.min(100, (c.netPaise / Math.max(1, totals.netPaise)) * 100))}%`,
                              }}
                            />
                          </span>
                        </button>
                      ))}
                    </div>
                  </Section>
                </div>
                <div className={styles.twoColumns}>
                  <Section
                    title="Checkout outcomes"
                    description="One order per gateway checkout, with its current status."
                  >
                    <div className={styles.outcomes}>
                      {[
                        [
                          "Paid, retained",
                          totals.paid -
                            totals.fullyRefunded -
                            totals.refundPending,
                        ],
                        ["Refunded in full", totals.fullyRefunded],
                        ["Refund pending", totals.refundPending],
                        ["Failed or abandoned", totals.failed],
                        ["Still open", totals.pending],
                        ["Unknown status", totals.unknown],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>{number(Number(value))}</strong>
                          <small>
                            {percent(ratio(Number(value), totals.attempts))}
                          </small>
                        </div>
                      ))}
                    </div>
                  </Section>
                  <Section
                    title="Refunds & upsells"
                    description="Refund completion and upsell attachment are measured separately."
                  >
                    <div className={styles.summaryRows}>
                      <div>
                        <span>Completed refund amount</span>
                        <strong>{money(totals.refundedPaise)}</strong>
                      </div>
                      <div>
                        <span>Pending refund amount</span>
                        <strong>{money(totals.refundPendingPaise)}</strong>
                      </div>
                      <div>
                        <span>Bundle → add-on CVR</span>
                        <strong>{percent(data.upsells.attachRate)}</strong>
                      </div>
                      <div>
                        <span>Bundle buyers who bought an add-on</span>
                        <strong>
                          {number(data.upsells.attachedBuyers)} /{" "}
                          {number(data.upsells.bundleBuyers)}
                        </strong>
                      </div>
                      <div>
                        <span>Paid orders with UTM attribution</span>
                        <strong>
                          {percent(data.quality.attributionCoverage)}
                        </strong>
                      </div>
                    </div>
                  </Section>
                </div>
                <Section
                  title="Products by net collected"
                  action={
                    <button
                      onClick={() => {
                        switchTab("Bundles");
                      }}
                    >
                      View bundles <ArrowUpRight size={14} />
                    </button>
                  }
                >
                  <ProductTable
                    searchable={false}
                    rows={data.products
                      .filter((p) => p.attempts > 0)
                      .slice(0, 8)}
                  />
                </Section>
                <details className={styles.daily}>
                  <summary>Daily ledger · {data.daily.length} days</summary>
                  <Table
                    values={data.daily.map((d) => [
                      d.date,
                      d.attempts,
                      d.paid,
                      d.checkoutCvr,
                      d.collectedPaise,
                      d.refundedPaise,
                      d.netPaise,
                    ])}
                    headers={[
                      "IST checkout date",
                      "Checkouts",
                      "Paid orders",
                      "Checkout CVR",
                      "Collected",
                      "Refunds",
                      "Net collected",
                    ]}
                  >
                    {data.daily.map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td>{number(d.attempts)}</td>
                        <td>{number(d.paid)}</td>
                        <td>{percent(d.checkoutCvr)}</td>
                        <td>{money(d.collectedPaise)}</td>
                        <td>{money(d.refundedPaise)}</td>
                        <td>{money(d.netPaise)}</td>
                      </tr>
                    ))}
                  </Table>
                </details>
              </>
            )}
            {tab === "Bundles" && (
              <Section
                title="Bundle performance"
                description="Every bundle SKU, including retired bundles with recorded sales. All amounts use recorded payments."
              >
                <div className={styles.tableTools}>
                  <label className={styles.search}>
                    <Search size={16} />
                    <input
                      placeholder="Search bundles…"
                      aria-label="Search bundles"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Bundle activity"
                    value={productActivity}
                    onChange={(e) => setProductActivity(e.target.value)}
                  >
                    <option value="all">All bundles</option>
                    <option value="attempts">With checkouts</option>
                    <option value="paid">With paid orders</option>
                    <option value="refunds">With refunds</option>
                  </select>
                </div>
                <ProductTable
                  rows={filteredProducts}
                  searchable={false}
                  showOffers
                />
                <p className={styles.footnote}>
                  Checkout CVR = paid orders ÷ recorded checkout attempts. Offer
                  CVR = matched buyers ÷ tracked offer viewers. — indicates a
                  missing denominator. Included-report revenue is not counted
                  again under Reports.
                </p>
              </Section>
            )}
            {tab === "Reports" && (
              <Section
                title="Report analytics"
                description="All catalog reports and recorded historical reports. Direct purchases, post-bundle add-ons and current access each have their own denominator."
              >
                <div className={styles.tableTools}>
                  <select
                    aria-label="Report analytics view"
                    value={reportView}
                    onChange={(e) => setReportView(e.target.value)}
                  >
                    <option value="performance">
                      Direct purchase conversion
                    </option>
                    <option value="paths">Purchase paths</option>
                    <option value="access">Current access</option>
                  </select>
                </div>
                {reportView === "performance" && (
                  <>
                    <ProductTable
                      rows={data.reportAnalytics.map((r) => r.direct)}
                      showOffers
                    />
                    <p className={styles.footnote}>
                      Direct checkout CVR = paid direct report orders ÷ recorded
                      direct checkouts. Offer CVR requires a recorded view and
                      subsequent matched purchase; missing tracking is shown as
                      —.
                    </p>
                  </>
                )}
                {reportView === "paths" && (
                  <>
                    <Table
                      filterLabel="Filter report purchase paths"
                      headers={[
                        "Report",
                        "Direct orders",
                        "Individual add-on orders",
                        "In combined add-ons",
                        "Bundle-buyer add-on CVR",
                        "Direct net collected",
                        "Individual add-on net",
                      ]}
                      values={data.reportAnalytics.map((r) => [
                        r.name,
                        r.standaloneOrders,
                        r.individualAddOnOrders,
                        r.sharedOrders,
                        r.addOnCvr,
                        r.standalonePaise,
                        r.singleUpsellPaise,
                      ])}
                    >
                      {data.reportAnalytics.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>{number(r.standaloneOrders)}</td>
                          <td>{number(r.individualAddOnOrders)}</td>
                          <td>{number(r.sharedOrders)}</td>
                          <td>{percent(r.addOnCvr)}</td>
                          <td>{money(r.standalonePaise)}</td>
                          <td>{money(r.singleUpsellPaise)}</td>
                        </tr>
                      ))}
                    </Table>
                    <p className={styles.footnote}>
                      Purchase-path counts exclude fully refunded orders. A
                      combined basket contributes one unit to each included
                      report, but its revenue stays on that basket in Add-ons.
                      Historical bundle contents and item prices were not saved
                      per order, so neither bundle revenue nor combination
                      revenue is allocated to reports.
                    </p>
                  </>
                )}
                {reportView === "access" && (
                  <>
                    {data.usage ? (
                      <Table
                        filterLabel="Filter report access"
                        headers={[
                          "Report",
                          "Paid customers with access",
                          "Customers with known access flags",
                          "Access rate",
                        ]}
                        values={data.reportAnalytics.map((r) => [
                          r.name,
                          r.holders?.holders,
                          r.holders?.knownCustomers,
                          r.holders?.accessRate,
                        ])}
                      >
                        {data.reportAnalytics.map((r) => (
                          <tr key={r.id}>
                            <td>{r.name}</td>
                            <td>{number(r.holders?.holders || 0)}</td>
                            <td>{number(r.holders?.knownCustomers || 0)}</td>
                            <td>{percent(r.holders?.accessRate ?? null)}</td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty>
                        Current report access is unavailable. Refresh to reload
                        complete account data.
                      </Empty>
                    )}
                    <p className={styles.footnote}>
                      Current access flags among customers with a paid purchase
                      in the selected dates, as of the last sync. Access is not
                      proof that a report was generated or read, and is not a
                      historical bundle entitlement count.
                    </p>
                  </>
                )}
              </Section>
            )}
            {tab === "Add-ons" && upsellCohort && (
              <>
                <Section
                  title="Bundle buyers → post-bundle add-ons"
                  description="Only add-on checkouts from the upsell flow after a bundle purchase. Both checkout dates must be in the selected range; standalone report purchases are excluded."
                >
                  <div className={styles.tableTools}>
                    <label>
                      Bundle cohort{" "}
                      <select
                        aria-label="Upsell bundle cohort"
                        value={upsellBundle}
                        onChange={(e) => setUpsellBundle(e.target.value)}
                      >
                        {data.upsells.cohorts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} · {number(c.bundleBuyers)} buyers
                          </option>
                        ))}
                      </select>
                    </label>
                    <span>
                      {number(upsellCohort.paidBundleOrders)} paid bundle orders
                      · {number(upsellCohort.bundleBuyers)} distinct identified
                      buyers
                    </span>
                  </div>
                  <div className={styles.threeMetrics}>
                    <Metric
                      label="Bought a post-bundle add-on"
                      value={percent(upsellCohort.cvr)}
                      detail={`${number(upsellCohort.buyers)} buyers ÷ ${number(upsellCohort.bundleBuyers)} bundle buyers`}
                    />
                    <Metric
                      label="No add-on purchased · drop-off"
                      value={percent(upsellCohort.dropOffRate)}
                      detail={`${number(upsellCohort.notPurchased)} buyers ÷ ${number(upsellCohort.bundleBuyers)} bundle buyers`}
                    />
                    <Metric
                      label="Retained-order CVR"
                      value={percent(upsellCohort.retainedCvr)}
                      detail={`${number(upsellCohort.retainedBuyers)} buyers with order value remaining ÷ ${number(upsellCohort.bundleBuyers)} bundle buyers`}
                    />
                  </div>
                  <p className={styles.footnote}>
                    CVR = bought add-on ÷ bundle buyers × 100. Drop-off = no
                    purchase ÷ bundle buyers × 100. Checkout CVR = bought add-on
                    ÷ buyers who started its checkout × 100. These are buyer
                    counts, not payment counts. Purchases before the bundle and
                    standalone report purchases and bundle-included reports are
                    excluded.
                  </p>
                  {!!upsellCohort.unidentifiedBundleOrders && (
                    <p className={styles.footnote}>
                      {number(upsellCohort.unidentifiedBundleOrders)} paid
                      bundle orders lack a customer identity and cannot be
                      included in buyer conversion. Identity coverage:{" "}
                      {percent(upsellCohort.identityCoverage)} of paid bundle
                      orders.
                    </p>
                  )}
                  {!!upsellCohort.unknownReportOrders && (
                    <p className={styles.footnote}>
                      {number(upsellCohort.unknownReportOrders)} matched add-on
                      checkouts lack an identifiable add-on and are excluded
                      from add-on conversion.
                    </p>
                  )}
                  {!upsellCohort.bundleBuyers && (
                    <Empty>
                      No identified paid bundle buyers in this cohort. Rates are
                      unavailable (—), not zero.
                    </Empty>
                  )}
                  <Table
                    filterLabel="Filter add-ons"
                    values={upsellCohort.reports.map((r) => [
                      r.name,
                      r.bundleBuyers,
                      r.checkoutBuyers,
                      r.checkoutStartRate,
                      r.buyers,
                      r.cvr,
                      r.notPurchased,
                      r.dropOffRate,
                      r.checkoutCvr,
                      r.retainedBuyers,
                      r.retainedCvr,
                      r.refundedBuyers,
                      r.refundRate,
                    ])}
                    headers={[
                      "Add-on",
                      "Bundle buyers",
                      "Started checkout",
                      "Checkout start %",
                      "Bought add-on",
                      "Buyer CVR %",
                      "No purchase",
                      "Drop-off %",
                      "Checkout CVR %",
                      "Retained-order buyers",
                      "Retained-order CVR %",
                      "Buyers with order refunds",
                      "Order refund rate %",
                    ]}
                  >
                    {upsellCohort.reports.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {r.name}
                          <small>{r.id}</small>
                        </td>
                        <td>{number(r.bundleBuyers)}</td>
                        <td>{number(r.checkoutBuyers)}</td>
                        <td>{percent(r.checkoutStartRate)}</td>
                        <td>{number(r.buyers)}</td>
                        <td className={styles.emphasis}>{percent(r.cvr)}</td>
                        <td>{number(r.notPurchased)}</td>
                        <td>{percent(r.dropOffRate)}</td>
                        <td>{percent(r.checkoutCvr)}</td>
                        <td>{number(r.retainedBuyers)}</td>
                        <td>{percent(r.retainedCvr)}</td>
                        <td>{number(r.refundedBuyers)}</td>
                        <td>{percent(r.refundRate)}</td>
                      </tr>
                    ))}
                  </Table>
                  <p className={styles.footnote}>
                    A buyer can purchase several add-ons, so add-on CVRs should
                    not be added. Order refund rate = buyers with a completed
                    refund on an order containing the add-on ÷ its buyers.
                    Retained-order buyers have a positive amount left on such an
                    order. Partial combination refunds cannot be assigned to
                    individual add-ons. Pending refunds remain retained until
                    completed. No-purchase drop-off can include people who never
                    saw an offer; a true page bounce rate requires session
                    tracking.
                  </p>
                </Section>
                <Section
                  title="Individual & combined add-ons"
                  description="Exact baskets across all bundle cohorts in the selected dates. Checkout conversion uses orders; the bundle filter above applies only to buyer conversion."
                >
                  <div className={styles.tableTools}>
                    <select
                      aria-label="Add-on basket type"
                      value={addOnView}
                      onChange={(e) => setAddOnView(e.target.value)}
                    >
                      <option value="all">Individual & combined</option>
                      <option value="individual">Individual add-ons</option>
                      <option value="combined">Combined add-ons</option>
                    </select>
                  </div>
                  <ProductTable
                    rows={data.products.filter(
                      (p) =>
                        p.category === "upsell" &&
                        (addOnView === "all" ||
                          (addOnView === "individual"
                            ? p.items.length === 1
                            : p.items.length > 1)) &&
                        p.items.some((id) =>
                          upsellCohort.reports.some((r) => r.id === id),
                        ),
                    )}
                  />
                </Section>
              </>
            )}
            {tab === "Coins" && (
              <>
                <Section
                  title="Usage & remaining balance"
                  description="Customers with a paid purchase in the selected dates. Balances and retained chat history reflect the last sync; usage is not limited to coin-package buyers."
                >
                  {data.usage ? (
                    <>
                      <div className={styles.threeMetrics}>
                        <Metric
                          label="Paying customers with questions"
                          value={`${number(data.usage.withQuestions)} / ${number(data.usage.paidCustomers)}`}
                          detail={`${percent(data.usage.chatActivationRate)} recorded chat activation`}
                        />
                        <Metric
                          label="Current coins remaining"
                          value={
                            data.usage.balanceKnown
                              ? number(data.usage.remainingCoins)
                              : "—"
                          }
                          detail={`${number(data.usage.balanceKnown)} of ${number(data.usage.paidCustomers)} customers have a known balance`}
                        />
                        <Metric
                          label="Bought coin packages"
                          value={percent(data.usage.coinBuyerCvr)}
                          detail={`${number(data.usage.coinBuyers)} of ${number(data.usage.paidCustomers)} paid customers · recorded history`}
                        />
                      </div>
                      <Table
                        headers={["Metric", "Value", "Scope"]}
                        values={[
                          [
                            "Recorded questions",
                            data.usage.periodQuestions,
                            "Selected dates",
                          ],
                          [
                            "Retained question history",
                            data.usage.historyQuestions,
                            "All retained history",
                          ],
                          [
                            "Balance with no chat",
                            data.usage.withBalanceNoChat,
                            "Known wallets",
                          ],
                          [
                            "Inactive 7+ days",
                            data.usage.inactiveSevenDays,
                            "Known wallets",
                          ],
                          [
                            "Low balance chat users",
                            data.usage.lowBalanceChatUsers,
                            "Known wallets",
                          ],
                          [
                            "Repeat coin buyers",
                            data.usage.repeatCoinBuyers,
                            "Recorded history",
                          ],
                        ]}
                      >
                        <tr>
                          <td>Recorded questions in selected dates</td>
                          <td>{number(data.usage.periodQuestions)}</td>
                          <td>Among this paying-customer cohort</td>
                        </tr>
                        <tr>
                          <td>Recorded questions in retained history</td>
                          <td>{number(data.usage.historyQuestions)}</td>
                          <td>
                            {number(data.usage.undatedQuestions)} undated
                            questions excluded from date-specific counts
                          </td>
                        </tr>
                        <tr>
                          <td>Balance remaining, no recorded chat</td>
                          <td>{number(data.usage.withBalanceNoChat)}</td>
                          <td>Customers with a known positive balance</td>
                        </tr>
                        <tr>
                          <td>Above, first purchase at least 7 days ago</td>
                          <td>{number(data.usage.inactiveSevenDays)}</td>
                          <td>Age measured at last sync</td>
                        </tr>
                        <tr>
                          <td>Chat users with fewer than 3 coins</td>
                          <td>{number(data.usage.lowBalanceChatUsers)}</td>
                          <td>
                            Customers with retained questions and a known
                            balance
                          </td>
                        </tr>
                        <tr>
                          <td>Repeat coin-package buyers</td>
                          <td>
                            {number(data.usage.repeatCoinBuyers)} ·{" "}
                            {percent(data.usage.repeatCoinBuyerRate)}
                          </td>
                          <td>
                            Two or more paid coin orders ÷ coin buyers, across
                            recorded history
                          </td>
                        </tr>
                      </Table>
                      <p className={styles.footnote}>
                        Balances are current wallet values, including any
                        remaining free or bundle credits. History may have been
                        deleted or overwritten. Recorded questions do not
                        establish exact coins spent. Duplicate account aliases
                        use the latest stored account balance once per matched
                        customer.
                      </p>
                    </>
                  ) : (
                    <Empty>
                      Wallet and chat usage could not be fully loaded. Refresh
                      to retry; payment totals are still available.
                    </Empty>
                  )}
                </Section>
                {data.usage && (
                  <Section
                    title="Usage distribution"
                    description="Retained questions per paying customer. Coin purchases cover recorded history for the same customers."
                  >
                    <Table
                      headers={[
                        "Recorded questions",
                        "Customers",
                        "Customer share",
                        "Bought coins",
                        "Coin buyer CVR",
                        "Coin purchases",
                      ]}
                      values={data.usage.bands.map((b) => [
                        b.label,
                        b.customers,
                        b.share,
                        b.coinBuyers,
                        b.coinBuyerCvr,
                        b.coinPurchases,
                      ])}
                    >
                      {data.usage.bands.map((b) => (
                        <tr key={b.label}>
                          <td>{b.label}</td>
                          <td>{number(b.customers)}</td>
                          <td>{percent(b.share)}</td>
                          <td>{number(b.coinBuyers)}</td>
                          <td>{percent(b.coinBuyerCvr)}</td>
                          <td>{number(b.coinPurchases)}</td>
                        </tr>
                      ))}
                    </Table>
                  </Section>
                )}

                <Section
                  title="Coin purchases"
                  description="Quantities from paid order records. Fully refunded purchases are excluded from coin totals."
                >
                  <Table
                    filterLabel="Filter coin packages"
                    values={data.products
                      .filter((p) => p.category === "coins")
                      .map((p) => [
                        p.name,
                        p.attempts,
                        p.paid,
                        p.checkoutCvr,
                        p.coins,
                        p.missingCoinOrders,
                        p.refundedPaise,
                        p.netPaise,
                      ])}
                    headers={[
                      "Package",
                      "Checkouts",
                      "Paid orders",
                      "Checkout CVR",
                      "Recorded coins sold",
                      "Missing quantities",
                      "Refunds",
                      "Net collected",
                    ]}
                  >
                    {data.products
                      .filter((p) => p.category === "coins")
                      .map((p) => (
                        <tr key={p.key}>
                          <td>{p.name}</td>
                          <td>{number(p.attempts)}</td>
                          <td>{number(p.paid)}</td>
                          <td>{percent(p.checkoutCvr)}</td>
                          <td>{number(p.coins)}</td>
                          <td>{number(p.missingCoinOrders)}</td>
                          <td>{money(p.refundedPaise)}</td>
                          <td className={styles.emphasis}>
                            {money(p.netPaise)}
                          </td>
                        </tr>
                      ))}
                  </Table>
                  <p className={styles.footnote}>
                    Package IDs are historical labels and may differ from coin
                    quantities. Exact coins spent and refund coin reversals
                    require a complete debit ledger; they are not inferred from
                    question counts.
                  </p>
                </Section>
                <Section
                  title="Unlimited chat passes"
                  description="Payment performance and matched offer conversion for the 20-minute chat pass."
                >
                  <ProductTable
                    rows={data.products.filter(
                      (p) => p.category === "chat_pass",
                    )}
                    showOffers
                  />
                </Section>
              </>
            )}
            <footer className={styles.footer}>
              <span>
                <Check size={14} /> {number(data.quality.rawRows)} history rows
                read · {number(data.quality.refundEvents)} refund records joined
                · {number(data.quality.duplicates)} duplicate sale copies
                removed
              </span>
              <button onClick={() => setDefinitions((v) => !v)}>
                Sources & definitions <Info size={13} />
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
