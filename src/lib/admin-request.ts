/** Сетевой отказ проходит тем же путём формы, что и ошибка серверного обработчика. */
export async function adminRequest<T>(request: () => Promise<T>) {
  try {
    return await request();
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Сервер не ответил. Повторите попытку." };
  }
}
