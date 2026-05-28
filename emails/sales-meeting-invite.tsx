import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

type SalesMeetingInviteEmailProps = {
  meetingTitle: string;
  presenterName: string;
  joinUrl: string;
  expiresAt: string;
};

const main = {
  backgroundColor: "#f5f7fb",
  color: "#172033",
  fontFamily: "Arial, sans-serif",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #d9e0ea",
  borderRadius: "8px",
  margin: "0 auto",
  padding: "28px",
  width: "560px",
};

const button = {
  backgroundColor: "#0f2f4f",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 700,
  padding: "10px 14px",
  textDecoration: "none",
};

export function SalesMeetingInviteEmail({
  meetingTitle,
  presenterName,
  joinUrl,
  expiresAt,
}: SalesMeetingInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Join your Reliance sales presentation</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading as="h1" style={{ fontSize: "24px", margin: "0 0 8px" }}>
            Reliance video meeting
          </Heading>
          <Text style={{ margin: "0 0 18px" }}>
            {presenterName} invited you to join a SafetyDocs360 sales presentation.
          </Text>
          <Text style={{ fontSize: "17px", fontWeight: 700 }}>{meetingTitle}</Text>
          <Link href={joinUrl} style={button}>
            Join video meeting
          </Link>
          <Hr />
          <Text style={{ color: "#657286", fontSize: "12px" }}>
            This guest link expires {expiresAt}. Camera, microphone, and screen sharing stay in your browser and are not recorded by Reliance.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
