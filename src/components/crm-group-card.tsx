"use client";

import { cn } from "@/lib/utils";
import { CRM_BRANCH, groupCardId, clientCardId } from "@/data/ids";
import { ADMIN_PANEL_BLUE } from "@/data/admin-ui";
import { displayPersonName, initialsOf } from "@/data/client-display";
import type { GroupMember } from "@/data/crm-cards";

export function CrmGroupMembers({
  title,
  items,
  onOpen,
  archive,
}: {
  title: string;
  items: GroupMember[];
  onOpen: (m: GroupMember) => void;
  archive?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className={archive ? "mt-4 rounded-2xl bg-[#d8dce3] p-3" : "mt-4"}>
      <p className={cn("text-[0.72rem] font-semibold uppercase tracking-wider", archive ? "text-[#5c636c]" : "text-muted")}>
        {title} · {items.length}
      </p>
      <ul className={cn("mt-1.5 divide-y overflow-hidden rounded-2xl ring-1", archive ? "divide-black/10 bg-[#e4e7ec] ring-black/10" : "divide-black/6 bg-white ring-black/6")}>
        {items.map((m) => {
          const titleName = displayPersonName(m.name, m.parent, m.phone);
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onOpen(m)}
                className={cn("flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left", archive ? "text-[#5a6169] hover:bg-black/[0.04]" : "hover:bg-primary/5")}
                title={clientCardId(m.id)}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[0.72rem] font-bold", archive ? "bg-[#c5cad1] text-[#4e555d]" : "bg-primary/10 text-primary")}>
                    {initialsOf(titleName)}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate font-medium", archive && "text-[#4a5058]")}>{titleName}</span>
                    <span className={cn("block truncate text-[0.75rem]", archive ? "text-[#7b828c]" : "text-muted")}>
                      {[`customerId ${m.id}`, m.age, m.parent && m.parent !== titleName ? m.parent : ""].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", archive ? "bg-[#c5cad1] text-[#4e555d]" : "bg-primary/10 text-primary")}>
                  {archive ? "архив" : m.status || "учится"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
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
      <CrmGroupMembers title="Учатся сейчас" items={members} onOpen={onOpenClient} />
      <CrmGroupMembers title="Архив группы" items={archive} onOpen={onOpenClient} archive />
    </div>
  );
}

export { ADMIN_PANEL_BLUE };
