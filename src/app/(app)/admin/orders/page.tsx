"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Filter,
  FileText,
  Loader2,
  PackageOpen,
  RefreshCw,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";

type OrderRow = {
  id: string;
  userId: string;
  email: string;
  customerName: string;
  dateOfPurchase: string | null;
  type: string;
  typeLabel: string;
  amount: number;
  currency: string;
  items: string[];
  itemCount: number;
};

type OrdersResponse = {
  orders: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PURCHASE_TYPES = [
  { value: "all", label: "All purchases" },
  { value: "bundle_payment", label: "Bundle" },
  { value: "upsell", label: "Upsell" },
  { value: "report", label: "Report" },
  { value: "coins", label: "Coins" },
];

const IST_TIMEZONE = "Asia/Kolkata";
const ORDERS_MIN_RANGE_START = "2024-01-01";

type CalendarRange = { startDate: string; endDate: string };
type CalendarCell = { isoDate: string; day: number; inCurrentMonth: boolean };

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function shiftIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function getCurrentIstDateIso(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getWeekStartMondayIso(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const mondayIndex = (d.getUTCDay() + 6) % 7;
  return shiftIsoDate(isoDate, -mondayIndex);
}

function getFirstDayOfMonthIso(isoDate: string): string {
  const [year, month] = isoDate.split("-").map((v) => Number(v));
  return `${year}-${pad2(month)}-01`;
}

function getPreviousMonthFirstIso(monthStartIso: string): string {
  const d = new Date(`${monthStartIso}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().split("T")[0];
}

function getFirstDayOfYearIso(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  return `${year}-01-01`;
}

function getPresetCalendarRange(preset: string): CalendarRange {
  const todayIso = getCurrentIstDateIso();
  switch (preset) {
    case "today":
      return { startDate: todayIso, endDate: todayIso };
    case "yesterday": {
      const iso = shiftIsoDate(todayIso, -1);
      return { startDate: iso, endDate: iso };
    }
    case "last_3d":
      return { startDate: shiftIsoDate(todayIso, -2), endDate: todayIso };
    case "last_7d":
      return { startDate: shiftIsoDate(todayIso, -6), endDate: todayIso };
    case "last_14d":
      return { startDate: shiftIsoDate(todayIso, -13), endDate: todayIso };
    case "last_30d":
      return { startDate: shiftIsoDate(todayIso, -29), endDate: todayIso };
    case "this_week":
      return { startDate: getWeekStartMondayIso(todayIso), endDate: todayIso };
    case "last_week": {
      const thisWeekStartIso = getWeekStartMondayIso(todayIso);
      return {
        startDate: shiftIsoDate(thisWeekStartIso, -7),
        endDate: shiftIsoDate(thisWeekStartIso, -1),
      };
    }
    case "this_month":
      return { startDate: getFirstDayOfMonthIso(todayIso), endDate: todayIso };
    case "last_month": {
      const thisMonthStartIso = getFirstDayOfMonthIso(todayIso);
      return {
        startDate: getPreviousMonthFirstIso(thisMonthStartIso),
        endDate: shiftIsoDate(thisMonthStartIso, -1),
      };
    }
    case "this_year":
      return { startDate: getFirstDayOfYearIso(todayIso), endDate: todayIso };
    case "maximum":
    default:
      return { startDate: ORDERS_MIN_RANGE_START, endDate: todayIso };
  }
}

function getMonthStartUtcDate(isoDate: string): Date {
  const [year, month] = isoDate.split("-").map((v) => Number(v));
  return new Date(Date.UTC(year, month - 1, 1));
}

function buildMonthGrid(viewMonthStart: Date): CalendarCell[] {
  const firstDayIso = viewMonthStart.toISOString().split("T")[0];
  const weekdayIndex = (viewMonthStart.getUTCDay() + 6) % 7;
  const gridStartIso = shiftIsoDate(firstDayIso, -weekdayIndex);
  const currentMonth = viewMonthStart.getUTCMonth();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const isoDate = shiftIsoDate(gridStartIso, i);
    const cellDate = new Date(`${isoDate}T00:00:00.000Z`);
    cells.push({
      isoDate,
      day: cellDate.getUTCDate(),
      inCurrentMonth: cellDate.getUTCMonth() === currentMonth,
    });
  }
  return cells;
}

function formatCalendarDateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

function formatCalendarDateShort(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

function formatIstRangeLabel(startDate: string, endDate: string): string {
  return `${formatCalendarDateLabel(startDate)}, 12:00 AM IST to ${formatCalendarDateLabel(endDate)}, 11:59 PM IST`;
}

function formatCurrency(value: number, currency: string = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const initialDateRange = useMemo(() => getPresetCalendarRange("maximum"), []);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("maximum");
  const [startDate, setStartDate] = useState(initialDateRange.startDate);
  const [endDate, setEndDate] = useState(initialDateRange.endDate);
  const [pickerStartDate, setPickerStartDate] = useState(initialDateRange.startDate);
  const [pickerEndDate, setPickerEndDate] = useState(initialDateRange.endDate);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarDropdownRef = useRef<HTMLDivElement | null>(null);
  const [calendarMonthStart, setCalendarMonthStart] = useState<Date>(() =>
    getMonthStartUtcDate(initialDateRange.endDate)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openItemsFor, setOpenItemsFor] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const activeFilterCount = useMemo(() => {
    return [typeFilter !== "all", datePreset !== "maximum"].filter(Boolean).length;
  }, [typeFilter, datePreset]);

  useEffect(() => {
    if (!isCalendarOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (calendarDropdownRef.current && target && !calendarDropdownRef.current.contains(target)) {
        setIsCalendarOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCalendarOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isCalendarOpen]);

  const fetchOrders = useCallback(async () => {
    const token = localStorage.getItem("admin_session_token");
    const expiry = localStorage.getItem("admin_session_expiry");

    if (!token || !expiry || new Date(expiry) < new Date()) {
      localStorage.removeItem("admin_session_token");
      localStorage.removeItem("admin_session_expiry");
      router.push("/admin/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        token,
        page: String(page),
        pageSize: String(pageSize),
        search: debouncedSearch,
        type: typeFilter,
      });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        cache: "no-store",
      });

      if (response.status === 401) {
        localStorage.removeItem("admin_session_token");
        localStorage.removeItem("admin_session_expiry");
        router.push("/admin/login");
        return;
      }

      const json = (await response.json()) as Partial<OrdersResponse> & { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Failed to fetch orders");
      }

      setOrders(json.orders || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch orders");
      setOrders([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, endDate, page, pageSize, router, startDate, typeFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const maxSelectableDate = getCurrentIstDateIso();
  const maxMonthStart = getMonthStartUtcDate(maxSelectableDate);
  const calendarCells = useMemo(() => buildMonthGrid(calendarMonthStart), [calendarMonthStart]);
  const monthLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(calendarMonthStart);

  const applyPresetRange = (preset: string) => {
    const presetRange = getPresetCalendarRange(preset);
    setDatePreset(preset);
    setStartDate(presetRange.startDate);
    setEndDate(presetRange.endDate);
    setPickerStartDate(presetRange.startDate);
    setPickerEndDate(presetRange.endDate);
    setCalendarMonthStart(getMonthStartUtcDate(presetRange.endDate));
    setIsCalendarOpen(false);
    setPage(1);
  };

  const handleCalendarDateSelect = (isoDate: string) => {
    if (isoDate < ORDERS_MIN_RANGE_START || isoDate > maxSelectableDate) return;

    if (!pickerStartDate || (pickerStartDate && pickerEndDate)) {
      setPickerStartDate(isoDate);
      setPickerEndDate("");
      return;
    }

    if (isoDate < pickerStartDate) {
      setPickerStartDate(isoDate);
      setPickerEndDate("");
      return;
    }

    setPickerEndDate(isoDate);
  };

  const applyCustomRange = () => {
    if (!pickerStartDate) return;
    const finalEndDate = pickerEndDate || pickerStartDate;
    setDatePreset("custom");
    setStartDate(pickerStartDate);
    setEndDate(finalEndDate);
    setIsCalendarOpen(false);
    setPage(1);
  };

  const clearFilters = () => {
    const presetRange = getPresetCalendarRange("maximum");
    setSearch("");
    setDebouncedSearch("");
    setTypeFilter("all");
    setDatePreset("maximum");
    setStartDate(presetRange.startDate);
    setEndDate(presetRange.endDate);
    setPickerStartDate(presetRange.startDate);
    setPickerEndDate(presetRange.endDate);
    setCalendarMonthStart(getMonthStartUtcDate(presetRange.endDate));
    setPage(1);
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const selectedRangeLabel = pickerStartDate
    ? `${formatCalendarDateLabel(pickerStartDate)}${
        pickerEndDate ? ` - ${formatCalendarDateLabel(pickerEndDate)}` : ""
      }`
    : "No date selected";
  const activeRangeButtonLabel =
    startDate && endDate
      ? startDate === endDate
        ? formatCalendarDateShort(startDate)
        : `${formatCalendarDateShort(startDate)} - ${formatCalendarDateShort(endDate)}`
      : "Select Range";

  const openInvoiceFromOrder = (order: OrderRow) => {
    const params = new URLSearchParams({
      txnId: order.id,
      from: "orders",
    });
    if (order.userId && order.userId !== "-") {
      params.set("userId", order.userId);
    }
    router.push(`/admin/invoices/view?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-white">
      <div className="border-b border-white/10 bg-[#111827]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/admin")}
              className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              aria-label="Back to admin"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold">Orders</h1>
              <p className="text-xs text-white/45">Payment records from AstroRekha checkout</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/admin/invoices")}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <FileText className="h-4 w-4" />
              Invoice Generator
            </button>
            <button
              onClick={fetchOrders}
              disabled={loading}
              className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-50"
              aria-label="Refresh orders"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-5">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141C2E]">
          <div className="flex flex-col gap-3 border-b border-white/10 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-white/45" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search user id, email, order id, item"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              />
              {search ? (
                <button
                  onClick={() => setSearch("")}
                  className="text-white/45 transition-colors hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-white/50">
                <Filter className="h-4 w-4" />
                <span className="text-xs">{activeFilterCount || "All"}</span>
              </div>
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-lg border border-white/10 bg-[#0F1626] px-2 text-sm text-white outline-none"
              >
                {PURCHASE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div>
                <label className="mb-1 block text-xs text-white/45">Quick Select</label>
                <select
                  value={datePreset}
                  onChange={(event) => applyPresetRange(event.target.value)}
                  className="h-9 rounded-lg border border-white/10 bg-[#0F1626] px-2 text-sm text-white outline-none"
                >
                  <option value="maximum">All Time</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last_3d">Last 3 Days</option>
                  <option value="last_7d">Last 7 Days</option>
                  <option value="last_14d">Last 14 Days</option>
                  <option value="last_30d">Last 30 Days</option>
                  <option value="this_week">This Week</option>
                  <option value="last_week">Last Week</option>
                  <option value="this_month">This Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="this_year">This Year</option>
                </select>
              </div>
              <div ref={calendarDropdownRef} className="relative">
                <label className="mb-1 block text-xs text-white/45">Custom Range</label>
                <button
                  onClick={() => setIsCalendarOpen((prev) => !prev)}
                  className={`h-9 rounded-lg border px-3 text-sm transition-colors ${
                    datePreset === "custom"
                      ? "border-blue-500/40 bg-blue-500/20 text-blue-300"
                      : "border-white/10 bg-[#0F1626] text-white/70 hover:bg-white/10"
                  }`}
                >
                  {activeRangeButtonLabel}
                </button>
                {isCalendarOpen ? (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[92vw] max-w-[92vw] rounded-2xl border border-white/15 bg-[#1A2235] p-4 shadow-2xl sm:w-[680px]">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-medium text-white/80">Custom Range</p>
                      <button
                        onClick={() => setIsCalendarOpen(false)}
                        className="rounded-md bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
                        aria-label="Close custom range picker"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mb-3 flex items-center justify-between">
                      <button
                        onClick={() =>
                          setCalendarMonthStart(
                            (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1))
                          )
                        }
                        className="rounded-md bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
                        aria-label="Previous month"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <p className="text-sm font-medium text-white">{monthLabel}</p>
                      <button
                        onClick={() =>
                          setCalendarMonthStart(
                            (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1))
                          )
                        }
                        disabled={calendarMonthStart.getTime() >= maxMonthStart.getTime()}
                        className="rounded-md bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Next month"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mb-2 grid grid-cols-7 gap-1 text-[11px] text-white/50">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
                        <div key={weekday} className="py-1 text-center">
                          {weekday}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {calendarCells.map((cell) => {
                        const isDisabled = cell.isoDate < ORDERS_MIN_RANGE_START || cell.isoDate > maxSelectableDate;
                        const isStart = pickerStartDate === cell.isoDate;
                        const isEnd = pickerEndDate === cell.isoDate;
                        const isInRange =
                          !!pickerStartDate &&
                          !!pickerEndDate &&
                          cell.isoDate >= pickerStartDate &&
                          cell.isoDate <= pickerEndDate;

                        return (
                          <button
                            key={cell.isoDate}
                            onClick={() => handleCalendarDateSelect(cell.isoDate)}
                            disabled={isDisabled}
                            className={`h-9 rounded-md text-sm transition-colors ${
                              isStart || isEnd
                                ? "bg-primary text-white"
                                : isInRange
                                ? "bg-primary/25 text-white"
                                : cell.inCurrentMonth
                                ? "bg-white/5 text-white hover:bg-white/15"
                                : "bg-white/[0.02] text-white/45 hover:bg-white/10"
                            } ${isDisabled ? "cursor-not-allowed opacity-30" : ""}`}
                            title={formatCalendarDateLabel(cell.isoDate)}
                          >
                            {cell.day}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-white/60">
                        Selected: <span className="text-white/90">{selectedRangeLabel}</span>
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setPickerStartDate(startDate);
                            setPickerEndDate(endDate);
                          }}
                          className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/20"
                        >
                          Reset
                        </button>
                        <button
                          onClick={applyCustomRange}
                          disabled={loading || !pickerStartDate}
                          className="rounded-md bg-blue-500/20 px-3 py-1.5 text-xs text-blue-300 transition-colors hover:bg-blue-500/30 disabled:opacity-50"
                        >
                          Apply Range
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              {activeFilterCount || search ? (
                <button
                  onClick={clearFilters}
                  className="h-9 rounded-lg border border-white/10 px-3 text-sm text-white/65 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Clear
                </button>
              ) : null}
            </div>
            </div>
            <p className="text-xs text-white/35">
              Selected Dates: {formatIstRangeLabel(startDate, endDate)}
            </p>
          </div>

          {error ? (
            <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-white/[0.03] text-xs text-white/55">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-medium">User ID</th>
                  <th className="px-4 py-3 text-left font-medium">Email ID</th>
                  <th className="px-4 py-3 text-left font-medium">
                    <span className="inline-flex items-center gap-1">
                      Date of Purchase <ChevronsUpDown className="h-3 w-3" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Type of Purchase</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Items</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-white/50">
                      <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
                      Loading orders...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-white/45">
                      <PackageOpen className="mx-auto mb-3 h-7 w-7 text-white/25" />
                      No orders found
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => openInvoiceFromOrder(order)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openInvoiceFromOrder(order);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer border-b border-white/[0.07] hover:bg-white/[0.03] focus:outline-none focus-visible:bg-white/[0.04]"
                    >
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate font-medium text-white/85">{order.userId}</p>
                        <p className="truncate text-xs text-white/35">{order.id}</p>
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <p className="truncate text-white/80">{order.email}</p>
                        {order.customerName ? (
                          <p className="truncate text-xs text-white/40">{order.customerName}</p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-white/70">
                        {formatDateTime(order.dateOfPurchase)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/70">
                          {order.typeLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-white">
                        {formatCurrency(order.amount, order.currency)}
                      </td>
                      <td className="relative px-4 py-3">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenItemsFor(openItemsFor === order.id ? null : order.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" />
                          {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${openItemsFor === order.id ? "rotate-90" : ""}`} />
                        </button>
                        {openItemsFor === order.id ? (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            className="absolute right-4 top-11 z-30 w-80 rounded-xl border border-white/15 bg-[#F8F8F6] p-3 text-[#2F302F] shadow-2xl"
                          >
                            <div className="mb-2 inline-flex items-center gap-1 rounded-md bg-[#E9E9E5] px-2 py-1 text-xs text-[#60615F]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#6B6C69]" />
                              Paid
                            </div>
                            <div className="space-y-2">
                              {order.items.map((item, index) => (
                                <div
                                  key={`${order.id}-${item}-${index}`}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-[#E0E0DC] bg-white px-3 py-2"
                                >
                                  <p className="text-sm font-medium leading-snug text-[#2F302F]">{item}</p>
                                  <p className="shrink-0 text-sm text-[#4F504D]">x 1</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-sm text-white/55">
            <span>
              {rangeStart}-{rangeEnd} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/60 transition-colors hover:bg-white/10 disabled:opacity-35"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-20 text-center text-xs">
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || loading}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/60 transition-colors hover:bg-white/10 disabled:opacity-35"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
