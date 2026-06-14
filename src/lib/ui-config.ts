import "server-only";

import { prisma } from "@/lib/prisma";

const DEFAULT_UI_CONFIG_CREATE = {
  id: 1,
  groupStandingsVisible: true,
};

export async function getOrCreateAppUiConfig() {
  return prisma.appUiConfig.upsert({
    where: { id: 1 },
    update: {},
    create: DEFAULT_UI_CONFIG_CREATE,
  });
}
