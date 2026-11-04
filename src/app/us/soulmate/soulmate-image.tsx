"use client";
import { discoverAsset, useSoulmateDiscover } from "@/components/soulmate-discover/Experience";
import Image, { type ImageProps } from "next/image";
import { soulmateAssetUrl } from "@/lib/us-soulmate-assets";

type SoulmateImageProps = Omit<ImageProps, "src" | "unoptimized" | "loader"> & { src: string };

/** Public marketing images go directly to R2, bypassing Next/Vercel image processing. */
export function SoulmateImage({ src, alt, ...props }: SoulmateImageProps) {
  const discover = useSoulmateDiscover();
  return <Image {...props} alt={alt} src={discover ? discoverAsset(discover, src) : soulmateAssetUrl(src)} unoptimized />;
}
