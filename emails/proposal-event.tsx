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

type ProposalEventEmailProps = {
  headline: string;
  message: string;
  proposalUrl: string;
  /** "Accepted", "Declined", "Awaiting approval" — the badge above the headline. */
  eventLabel: string;
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

export function ProposalEventEmail({
  headline,
  message,
  proposalUrl,
  eventLabel,
}: ProposalEventEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{headline}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text
            style={{
              color: "#657286",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              margin: "0 0 6px",
              textTransform: "uppercase",
            }}
          >
            {eventLabel}
          </Text>
          <Heading as="h1" style={{ fontSize: "22px", margin: "0 0 10px" }}>
            {headline}
          </Heading>
          <Text style={{ margin: "0 0 20px" }}>{message}</Text>
          <Link href={proposalUrl} style={button}>
            Open the proposal
          </Link>
          <Hr />
          <Text style={{ color: "#657286", fontSize: "12px" }}>
            Sent by the Reliance internal platform because a proposal you own changed status.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
