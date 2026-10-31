import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

// Old landing links still work and keep campaign parameters for root attribution.
export default async function WelcomeRedirect({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) || {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }

  const query = params.toString();
  redirect(query ? `/?${query}` : "/");
}
