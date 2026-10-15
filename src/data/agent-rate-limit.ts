/** Лимит одного диалога. Старые каналы передают свой ключ в ip. */
export function chatRateKey(data: { ip?: string; sessionId?: string }) {
  return String(data.ip || (data.sessionId ? `site:${data.sessionId}` : "anon")).slice(0, 160);
}

export function createChatLimiter(limit = 40, windowMs = 60 * 60 * 1000) {
  const buckets = new Map<string, number[]>();
  return (key: string, now = Date.now()) => {
    const prev = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (buckets.size >= 10000 && !buckets.has(key)) {
      for (const [id, times] of buckets) if (!times.length || now - times[times.length - 1] >= windowMs) buckets.delete(id);
      if (buckets.size >= 10000) buckets.delete(buckets.keys().next().value!);
    }
    if (prev.length >= limit) {
      buckets.set(key, prev);
      return true;
    }
    buckets.set(key, [...prev, now]);
    return false;
  };
}
