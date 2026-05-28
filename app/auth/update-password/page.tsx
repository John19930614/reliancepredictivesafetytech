import { UpdatePasswordForm } from "@/app/auth/update-password/UpdatePasswordForm";

type UpdatePasswordPageProps = {
  searchParams: Promise<{ message?: string; mode?: string }>;
};

export default async function UpdatePasswordPage({ searchParams }: UpdatePasswordPageProps) {
  const params = await searchParams;
  return <UpdatePasswordForm message={params.message} mode={params.mode === "invite" ? "invite" : "reset"} />;
}
