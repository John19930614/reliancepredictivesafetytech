import { UpdatePasswordForm } from "@/app/auth/update-password/UpdatePasswordForm";

type UpdatePasswordPageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function UpdatePasswordPage({ searchParams }: UpdatePasswordPageProps) {
  const params = await searchParams;
  return <UpdatePasswordForm message={params.message} />;
}
