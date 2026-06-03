import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type CreateAuditLogInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown> | null;
  reviewedUserId?: string | null;
  paymentConfigId?: number | null;
};

export async function createAuditLog(input: CreateAuditLogInput) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      reviewedUserId: input.reviewedUserId ?? null,
      paymentConfigId: input.paymentConfigId ?? null,
    },
  });
}
