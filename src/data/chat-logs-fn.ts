import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { adminChatLogsData, upsertSession, type ChatTurn } from "./chat-logs";

export const saveChatLog = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        id: string;
        path?: string;
        partner?: string;
        voice?: boolean;
        admin?: boolean;
        closed?: boolean;
        messages: ChatTurn[];
      },
  )
  .handler(async ({ data }) => upsertSession(data));

export const adminChatLogs = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; id?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    return adminChatLogsData(data.id);
  });
