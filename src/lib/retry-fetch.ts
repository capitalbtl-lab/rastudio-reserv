export async function retryFetch<T>(fn: () => Promise<T>, tries = 2, ms = 12000): Promise<T> {
  let last: unknown;
  const n = Math.max(1, tries);
  for (let i = 0; i < n; i++) {
    try {
      if (!ms || ms <= 0) return await fn();
      return await Promise.race([
        fn(),
        new Promise<T>((_, rej) => window.setTimeout(() => rej(new Error("Сервер не ответил. Обновите страницу.")), ms)),
      ]);
    } catch (e) {
      last = e;
      if (i === n - 1) break;
      await new Promise((r) => window.setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}