import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

// Old landing links still work and keep campaign parameters for root attribution.
export default function WelcomeRedirect({ searchParams }: { searchParams?: SearchParams }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }

  const query = params.toString();
  redirect(query ? `/?${query}` : "/");
}
