"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { discoverRetryPath } from "@/lib/soulmate-discover-checkout";
export function SoulmateRetryLink({ orderId, fallback, className }: { orderId?: string; fallback: string; className: string }) {
  const [href, setHref] = useState(fallback);
  useEffect(() => { setHref(discoverRetryPath(orderId, fallback)); }, [orderId, fallback]);
  return <Link className={className} href={href}>Return to checkout</Link>;
}
