export type FunnelAutoEvent = "site" | "group" | "tariff";

export type FunnelAuto = {
  siteOn: boolean;
  siteStageId: number;
  groupOn: boolean;
  groupStageId: number;
  tariffOn: boolean;
  tariffStageId: number;
  skipIfPaid: boolean;
};

export const FUNNEL_AUTO_DEFAULT: FunnelAuto = {
  siteOn: true,
  siteStageId: 1,
  groupOn: true,
  groupStageId: 2,
  tariffOn: true,
  tariffStageId: 4,
  skipIfPaid: true,
};
