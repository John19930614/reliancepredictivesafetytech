import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type DigestItem = {
  title: string;
  body: string;
  priority: string;
  actionHref: string | null;
  aiSummary: string | null;
};

type DailyDigestEmailProps = {
  appUrl: string;
  recipientName: string;
  summary: string;
  items: DigestItem[];
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

export function DailyDigestEmail({ appUrl, recipientName, summary, items }: DailyDigestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reliance daily workflow digest</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading as="h1" style={{ fontSize: "24px", margin: "0 0 8px" }}>
            Daily workflow digest
          </Heading>
          <Text style={{ margin: "0 0 18px" }}>Good morning, {recipientName}. Here is what needs attention in the portal.</Text>
          <Text>{summary}</Text>
          <Hr />
          {items.length === 0 ? (
            <Text>No urgent notifications are waiting right now.</Text>
          ) : (
            items.map((item) => (
              <Section key={`${item.priority}-${item.title}`} style={{ marginBottom: "18px" }}>
                <Text style={{ color: "#526176", fontSize: "12px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {item.priority}
                </Text>
                <Text style={{ fontSize: "17px", fontWeight: 700, margin: "4px 0" }}>{item.title}</Text>
                <Text style={{ margin: "4px 0" }}>{item.body}</Text>
                {item.aiSummary ? <Text style={{ color: "#526176", margin: "4px 0" }}>{item.aiSummary}</Text> : null}
                {item.actionHref ? (
                  <Link href={`${appUrl}${item.actionHref}`} style={{ color: "#0f2f4f", fontWeight: 700 }}>
                    Open item
                  </Link>
                ) : null}
              </Section>
            ))
          )}
          <Hr />
          <Link href={`${appUrl}/employee/ai`} style={button}>
            Open AI command center
          </Link>
          <Text style={{ color: "#657286", fontSize: "12px", marginTop: "24px" }}>
            AI summaries are decision support only. Safety, legal, HR, payroll, and client-status changes still require human review.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
