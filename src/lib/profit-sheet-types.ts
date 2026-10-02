export interface AccountSpendBreakdown {
  accountId: string;
  accountName: string;
  currency: string;
  spend: number;
  usd: number;
  inr: number;
}

export interface DailySpendBreakdown {
  date: string;
  accounts: AccountSpendBreakdown[];
  totalUSD: number;
  totalINR: number;
  exchangeRate: number;
  fetchedAt: string;
}

export interface AccountBalanceBreakdown {
  accountId: string;
  accountName: string;
  currency: "USD" | "INR";
  balanceMode: "outstanding" | "remaining_spend_limit";
  balance: number;
  usd: number;
  inr: number;
}

export interface AccountBalanceSummary {
  date: string;
  accounts: AccountBalanceBreakdown[];
  totalUSD: number;
  totalINR: number;
  exchangeRate: number;
  fetchedAt: string;
}
