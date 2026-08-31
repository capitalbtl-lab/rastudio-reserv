import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

type Props = {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
};

function searchFrom(query?: string) {
  if (!query) return undefined;
  return Object.fromEntries(new URLSearchParams(query));
}

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

  const [pathAndHash, hashPart] = to.split("#");
  const [pathname, query] = (pathAndHash || "/").split("?");
  const search = searchFrom(query);
  const hash = hashPart ? { hash: hashPart } : {};

  if (pathname === "/") {
    return (
      <Link ref={ref} to="/" className={className} style={style} onClick={onClick} {...hash}>
        {children}
      </Link>
    );
  }

  if (pathname === "/schedule") {
    return (
      <Link ref={ref} to="/schedule" className={className} style={style} onClick={onClick} {...hash}>
        {children}
      </Link>
    );
  }

  const splat = pathname.replace(/^\/+/, "");
  return (
    <Link
      ref={ref}
      to="/$"
      params={{ _splat: splat }}
      search={search}
      {...hash}
      className={className}
      style={style}
      onClick={onClick}
    >
      {children}
    </Link>
  );
});
