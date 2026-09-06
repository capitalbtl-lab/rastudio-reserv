import { cn } from "@/lib/utils";
import { localSrc } from "@/lib/local-media";
import { cleanWixAlt, imageTitle } from "../data/wix-seo-core";

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

export { imageTitle };

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