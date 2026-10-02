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
  balance: number;
  usd: number;
  inr: number;
}

export interface AccountBalanceSummary {
  accounts: AccountBalanceBreakdown[];
  totalUSD: number;
  totalINR: number;
  exchangeRate: number;
  fetchedAt: string;
}
