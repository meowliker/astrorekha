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
