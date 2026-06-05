import { SalesMeetingRoom } from "@/components/SalesMeetingRoom";

type SalesMeetingGuestPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function SalesMeetingGuestPage({ params }: SalesMeetingGuestPageProps) {
  const { token } = await params;

  return <SalesMeetingRoom mode="guest" token={decodeURIComponent(token)} />;
}
