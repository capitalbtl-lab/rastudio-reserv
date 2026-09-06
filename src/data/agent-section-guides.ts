import { createServerFn } from "@tanstack/react-start";

export {
  FACTORY_GUIDES,
  GUIDE_REV,
  factoryGuide,
  loadGuides,
  consultantGuidePrompt,
  consultantIdGraphPrompt,
  CORE_ID_NODES,
  CORE_ID_EDGES,
  CORE_ID_HINT,
  type GuideOp,
  type GuideRow,
  type GuideTab,
  type SectionGuide,
} from "./agent-section-guides-data";

export const adminSectionGuides = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "get" | "save" | "reset";
        id?: string;
        on?: boolean;
        body?: string;
      },
  )
  .handler(async ({ data }) => {
    const { handleAdminSectionGuides } = await import("./agent-section-guides-run");
    return handleAdminSectionGuides(data);
  });
