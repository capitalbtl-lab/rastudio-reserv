import { cn } from "@/lib/utils";
import { localSrc } from "@/lib/local-media";
import { cleanWixAlt } from "../data/wix-seo-core";

type Props = {
  src: string;
  alt: string;
  filename?: string;
  className?: string;
  imgClassName?: string;
  width?: number;
  height?: number;
  loading?: "lazy" | "eager";
};

const HASH_FILE = /^[0-9a-f]{5,8}_[0-9a-f]{8,}/i;

export function imageTitle(filename?: string, alt?: string) {
  const file = String(filename || "").trim();
  const label = String(alt || "").trim();
  if (!file || HASH_FILE.test(file) || /empty-state|placeholder|image-empty/i.test(file)) {
    return cleanWixAlt(label, file);
  }
  return file.replace(/\.(png|jpe?g|webp|gif)$/i, "");
}

export function SeoImage({
  src,
  alt,
  filename,
  className,
  imgClassName,
  width,
  height,
  loading = "lazy",
}: Props) {
  const label = cleanWixAlt(alt, filename);
  const title = imageTitle(filename, label);
  return (
    <figure className={cn("overflow-hidden", className)}>
      <img
        src={localSrc(src)}
        alt={label}
        title={title || undefined}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        className={cn("h-full w-full object-cover", imgClassName)}
      />
    </figure>
  );
}