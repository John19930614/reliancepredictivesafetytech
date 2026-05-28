import { SalesMeetingRoom } from "@/components/SalesMeetingRoom";

type EmployeeSalesMeetingPageProps = {
  params: Promise<{
    meetingId: string;
  }>;
};

export default async function EmployeeSalesMeetingPage({ params }: EmployeeSalesMeetingPageProps) {
  const { meetingId } = await params;

  return <SalesMeetingRoom mode="employee" meetingId={meetingId} />;
}
