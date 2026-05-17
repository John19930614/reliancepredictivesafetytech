import type { Database } from "@/lib/supabase/types";

export const parkingLotLanes = [
  {
    id: "do_now",
    label: "Do Now",
    description: "Active or first build",
  },
  {
    id: "build_next",
    label: "Build Next",
    description: "Next priority",
  },
  {
    id: "parking_lot",
    label: "Parking Lot",
    description: "Save for later",
  },
] as const;

export const parkingLotPriorities = ["Low", "Medium", "High", "Critical"] as const;

export const parkingLotCategorySeed = [
  {
    slug: "brainstorming-parking-lots",
    title: "Brainstorming Parking Lots",
    description: "Movable car stickers for safety platform ideas",
    sortOrder: 0,
  },
  {
    slug: "data-management",
    title: "Data Management",
    description: "Recordkeeping, certs, data structure, and multi-location organization",
    sortOrder: 10,
  },
  {
    slug: "ai-system-management",
    title: "AI System Management",
    description: "Predictive risk, scoring, alerts, summaries, and trend intelligence",
    sortOrder: 20,
  },
  {
    slug: "document-control",
    title: "Document Control",
    description: "Document generation, review workflow, versioning, and client portals",
    sortOrder: 30,
  },
  {
    slug: "hse-management-system",
    title: "HSE Management System",
    description: "Inspections, incidents, corrective actions, meetings, permits, and programs",
    sortOrder: 40,
  },
  {
    slug: "training-and-certs",
    title: "Training and Certs",
    description: "Training documents, certificate dates, expiration tracking, and compliance reports",
    sortOrder: 50,
  },
  {
    slug: "high-risk-and-alerts",
    title: "High Risk and Alerts",
    description: "Serious event alerts, SIFp / IDLH escalation, and cross-location sorting",
    sortOrder: 60,
  },
  {
    slug: "inspection-and-forms",
    title: "Inspection and Forms",
    description: "Inspection card variants, custom forms, checklists, and field cards",
    sortOrder: 70,
  },
  {
    slug: "integrations",
    title: "Integrations",
    description: "Microsoft, Procore, document storage, calendar, and task connections",
    sortOrder: 80,
  },
  {
    slug: "client-setup-options",
    title: "Client Setup Options",
    description: "Account setup choices, module packages, permissions, and onboarding",
    sortOrder: 90,
  },
  {
    slug: "pricing-and-model",
    title: "Pricing and Model",
    description: "First-year packages, CSEP reviews, add-ons, tiers, and portal access",
    sortOrder: 100,
  },
  {
    slug: "1910-expansion",
    title: "1910 Expansion",
    description: "General industry roadmap, written programs, checklists, and future modules",
    sortOrder: 110,
  },
  {
    slug: "blank-category-parking-lot",
    title: "Blank Category Parking Lot",
    description: "Use this board to collect future ideas and drag blank cars into the right lane",
    sortOrder: 120,
  },
] as const;

export type ParkingLotLane = (typeof parkingLotLanes)[number]["id"];
export type ParkingLotPriority = (typeof parkingLotPriorities)[number];
export type BrainstormingParkingLotCategory = Database["public"]["Tables"]["brainstorming_parking_lot_categories"]["Row"];
export type BrainstormingParkingLotCard = Database["public"]["Tables"]["brainstorming_parking_lot_cards"]["Row"];
export type BrainstormingParkingLotCardInsert = Database["public"]["Tables"]["brainstorming_parking_lot_cards"]["Insert"];
export type BrainstormingParkingLotCardUpdate = Database["public"]["Tables"]["brainstorming_parking_lot_cards"]["Update"];

export function isParkingLotLane(value: string): value is ParkingLotLane {
  return parkingLotLanes.some((lane) => lane.id === value);
}

export function getParkingLotLaneLabel(value: string) {
  return parkingLotLanes.find((lane) => lane.id === value)?.label ?? "Parking Lot";
}
