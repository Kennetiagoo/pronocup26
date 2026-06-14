import ResetPasswordForm from "@/components/reset-password-form";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function RestablecerPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  return <ResetPasswordForm token={params.token ?? ""} />;
}

