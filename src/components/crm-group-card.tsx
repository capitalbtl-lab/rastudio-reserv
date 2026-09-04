"use client";

import { cn } from "@/lib/utils";
import { CRM_BRANCH, clientCardId, groupCardId } from "@/data/ids";
import { displayPersonName, initialsOf } from "@/data/client-display";
import type { GroupMember } from "@/data/crm-cards";

export function GroupLoadScene({ hint }: { hint?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3 overflow-hidden rounded-2xl bg-white/80 px-3 py-2.5 ring-1 ring-black/6">
      <div className="relative h-11 w-11 shrink-0">
        <span className="absolute inset-0 animate-spin rounded-full" style={{ animationDuration: "2.8s", background: "conic-gradient(from 90deg, #93c5fd, #f9a8d4, #fde68a, #86efac, #93c5fd)" }} />
        <span className="absolute inset-[3px] rounded-full bg-white" />
        <span className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 shadow-[inset_0_0_0_2px_rgba(180,83,9,0.25)]" />
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-100" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Собираю группу</p>
        <p className="truncate text-[0.72rem] text-muted">{hint || "ученики, лиды и расписание"}</p>
        <div className="mt-1.5 flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400 [animation-delay:120ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400 [animation-delay:240ms]" />
        </div>
      </div>
    </div>
  );
}

function MemberSkeleton({ n = 3 }: { n?: number }) {
  return (
    <ul className="mt-1.5 divide-y divide-black/6 overflow-hidden rounded-2xl bg-white ring-1 ring-black/6">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex items-center gap-2.5 px-3 py-2.5">
          <span className="h-8 w-8 shrink-0 animate-pulse rounded-xl bg-black/8" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block h-3 w-2/3 animate-pulse rounded bg-black/10" />
            <span className="block h-2.5 w-1/2 animate-pulse rounded bg-black/5" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CrmGroupMembers({
  title,
  items,
  onOpen,
  onRemove,
  onAdd,
  archive,
  variant,
  loading,
  busyId,
}: {
  title: string;
  items: GroupMember[];
  onOpen: (m: GroupMember) => void;
  onRemove?: (m: GroupMember) => void;
  onAdd?: () => void;
  archive?: boolean;
  variant?: "active" | "lead" | "archive";
  loading?: boolean;
  busyId?: number;
}) {
  const kind = variant || (archive ? "archive" : "active");
  const wrap =
    kind === "archive"
      ? "mt-4 rounded-2xl bg-[#d8dce3] p-3"
      : kind === "lead"
        ? "mt-4 rounded-2xl bg-amber-50/80 p-3"
        : "mt-4";
  const head = kind === "archive" ? "text-[#5c636c]" : kind === "lead" ? "text-amber-900/80" : "text-muted";
  const list =
    kind === "archive"
      ? "divide-black/10 bg-[#e4e7ec] ring-black/10"
      : kind === "lead"
        ? "divide-amber-200/80 bg-white ring-amber-200/80"
        : "divide-black/6 bg-white ring-black/6";
  const avatar =
    kind === "archive"
      ? "bg-[#c5cad1] text-[#4e555d]"
      : kind === "lead"
        ? "bg-amber-100 text-amber-900"
        : "bg-primary/10 text-primary";
  const badge =
    kind === "archive"
      ? "bg-[#c5cad1] text-[#4e555d]"
      : kind === "lead"
        ? "bg-amber-100 text-amber-900"
        : "bg-primary/10 text-primary";
  const label = kind === "archive" ? "архив" : kind === "lead" ? "лид" : "";
  return (
    <div className={wrap}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-[0.72rem] font-semibold uppercase tracking-wider", head)}>
          {title} · {loading && !items.length ? "…" : items.length}
        </p>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full bg-white px-2.5 py-0.5 text-[0.72rem] font-semibold text-primary ring-1 ring-black/8 hover:ring-primary/30"
          >
            + добавить
          </button>
        ) : null}
      </div>
      {loading && !items.length ? (
        <MemberSkeleton n={kind === "archive" ? 2 : 4} />
      ) : items.length ? (
        <ul className={cn("mt-1.5 divide-y overflow-hidden rounded-2xl ring-1", list)}>
          {items.map((m) => {
            const titleName = displayPersonName(m.name, m.parent, m.phone);
            const busy = busyId === m.id;
            return (
              <li key={m.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => onOpen(m)}
                  className={cn("flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2.5 text-left", kind === "archive" ? "text-[#5a6169] hover:bg-black/[0.04]" : "hover:bg-primary/5")}
                  title={clientCardId(m.id)}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[0.72rem] font-bold", avatar)}>
                      {initialsOf(titleName)}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate font-medium", kind === "archive" && "text-[#4a5058]")}>{titleName}</span>
                      <span className={cn("block truncate text-[0.75rem]", kind === "archive" ? "text-[#7b828c]" : "text-muted")}>
                        {[m.age, m.parent && m.parent !== titleName ? m.parent : "", m.phone].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", badge)}>
                    {label || m.status || "учится"}
                  </span>
                </button>
                {onRemove ? (
                  <button
                    type="button"
                    disabled={busy}
                    title="Удалить из группы"
                    aria-label={`Удалить ${titleName} из группы`}
                    onClick={() => onRemove(m)}
                    className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[1.05rem] leading-none text-muted/70 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    {busy ? "…" : "×"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={cn("mt-1.5 rounded-2xl px-3 py-2.5 text-sm", kind === "archive" ? "bg-[#e4e7ec] text-[#7b828c]" : "bg-white text-muted ring-1 ring-black/6")}>
          Пока никого
        </p>
      )}
    </div>
  );
}

/** Единая шапка карточки группы. Ключ — groupCardId = card:group:{branchId}:{groupId}. */
export function CrmGroupCard({
  branchId,
  groupId,
  name,
  age,
  subject,
  teacher,
  members,
  archive,
  onOpenClient,
  children,
}: {
  branchId: number;
  groupId: number;
  name: string;
  age?: string;
  subject?: string;
  teacher?: string;
  members: GroupMember[];
  archive: GroupMember[];
  onOpenClient: (m: GroupMember) => void;
  children?: React.ReactNode;
}) {
  const key = groupCardId(branchId, groupId);
  const branch = CRM_BRANCH[branchId]?.short || "";
  return (
    <div data-card-id={key} data-group-id={groupId || undefined} data-branch-id={branchId || undefined}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">
        Карточка группы · {key}
      </p>
      <h4 className="font-display mt-1 text-[1.45rem] leading-tight">{name || "Группа"}</h4>
      <p className="mt-1.5 flex flex-wrap gap-1.5 text-sm text-muted">
        {groupId ? <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[0.72rem] ring-1 ring-black/8">gid {groupId}</span> : null}
        {branch ? <span>{branch}</span> : null}
        {age ? <span>{age}</span> : null}
        {subject ? <span>{subject}</span> : null}
        {teacher ? <span>{teacher}</span> : null}
      </p>
      {children}
      <CrmGroupMembers title="Ученики" items={members.filter((m) => m.status !== "лид")} onOpen={onOpenClient} />
      <CrmGroupMembers title="Лиды" items={members.filter((m) => m.status === "лид")} onOpen={onOpenClient} variant="lead" />
      <CrmGroupMembers title="Архивные ученики" items={archive} onOpen={onOpenClient} variant="archive" />
    </div>
  );
}
