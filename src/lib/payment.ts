import { PaymentStatus } from "@prisma/client";

import { paymentStatusLabelEs } from "@/lib/i18n/es";

export function paymentStatusLabel(status: PaymentStatus) {
  return paymentStatusLabelEs(status);
}
