import { cn } from "@/lib/utils";

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
  return (
    <figure className={cn("overflow-hidden", className)}>
      <img
        src={src}
        alt={alt}
        title={filename || alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        className={cn("h-full w-full object-cover", imgClassName)}
      />
    </figure>
  );
}
