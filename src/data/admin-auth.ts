import { createHmac, timingSafeEqual } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";

function secret() {
  return process.env.ADMIN_PASSWORD?.trim() || "";
}

function sign(value: string) {
  return createHmac("sha256", secret() || "off").update(value).digest("hex").slice(0, 32);
}

export function makeAdminToken() {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `ok.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function tokenOk(token?: string | null) {
  if (!secret() || !token) return false;
  const parts = token.split(".");
  if (parts.length < 3) return false;
  const exp = Number(parts[1]);
  if (!exp || Date.now() > exp) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expect = sign(payload);
  const got = parts[2];
  if (expect.length !== got.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expect), Buffer.from(got));
  } catch {
    return false;
  }
}

function cookieToken() {
  try {
    const req = getRequest();
    const raw = req.headers.get("cookie") || "";
    const m = raw.match(/(?:^|;\s*)ra_admin=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch {
    return "";
  }
}

export function isAdminRequest(token?: string) {
  return tokenOk(token) || tokenOk(cookieToken());
}
