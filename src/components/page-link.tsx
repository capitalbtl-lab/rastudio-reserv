import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

type Props = {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
};

export const PageLink = forwardRef<HTMLAnchorElement, Props>(function PageLink(
  { to, className, children, onClick, style },
  ref,
) {
  if (/^https?:\/\//i.test(to) || to.startsWith("tel:") || to.startsWith("mailto:")) {
    return (
      <a ref={ref} href={to} className={className} style={style} onClick={onClick}>
        {children}
      </a>
    );
  }
  if (to === "/") {
    return (
      <Link ref={ref} to="/" className={className} style={style} onClick={onClick}>
        {children}
      </Link>
    );
  }
  const splat = to.replace(/^\/+/, "");
  return (
    <Link
      ref={ref}
      to="/$"
      params={{ _splat: splat }}
      className={className}
      style={style}
      onClick={onClick}
    >
      {children}
    </Link>
  );
});
