/**
 * The defect this covers: when the server refused a status change, the select
 * kept showing the REJECTED target. The row then displayed a state the database
 * never accepted, and because a controlled <select> fires no change event when
 * the value it already holds is re-picked, the operator could not retry without
 * reloading the page.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/app/employee/grants/actions", () => ({
  changeGrantStatus: vi.fn(async () => ({ ok: true })),
}));

import { changeGrantStatus } from "@/app/employee/grants/actions";
import { GrantStatusEditor } from "./GrantStatusEditor";

const changeMock = vi.mocked(changeGrantStatus);
const GRANT_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  changeMock.mockResolvedValue({ ok: true });
});

describe("GrantStatusEditor", () => {
  it("commits a non-terminal status as soon as it is picked", async () => {
    render(<GrantStatusEditor grantId={GRANT_ID} status="identified" />);

    await userEvent.selectOptions(screen.getByRole("combobox"), "researching");

    await waitFor(() => expect(changeMock).toHaveBeenCalledWith(GRANT_ID, expect.objectContaining({ status: "researching" })));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole("combobox")).toHaveValue("researching");
  });

  it("returns the select to the stored status when the server refuses", async () => {
    changeMock.mockResolvedValue({ ok: false, error: "This grant changed while you were looking at it." });

    render(<GrantStatusEditor grantId={GRANT_ID} status="identified" />);

    await userEvent.selectOptions(screen.getByRole("combobox"), "researching");

    await screen.findByText("This grant changed while you were looking at it.");
    // The row is still 'identified' in the database, so that is what it shows.
    expect(screen.getByRole("combobox")).toHaveValue("identified");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("lets the operator retry the same target after a refusal", async () => {
    changeMock.mockResolvedValueOnce({ ok: false, error: "Could not update status." });

    render(<GrantStatusEditor grantId={GRANT_ID} status="identified" />);
    const select = screen.getByRole("combobox");

    await userEvent.selectOptions(select, "researching");
    await screen.findByText("Could not update status.");

    // In a real browser re-picking the value a select already holds fires no
    // change event, which is what stranded the operator before the reset. The
    // test harness is more forgiving than that, so this asserts the retry
    // reaches the server rather than proving the browser behaviour.
    await userEvent.selectOptions(select, "researching");

    await waitFor(() => expect(changeMock).toHaveBeenCalledTimes(2));
    expect(select).toHaveValue("researching");
  });

  it("asks for a reason before closing a grant rather than committing on change", async () => {
    render(<GrantStatusEditor grantId={GRANT_ID} status="researching" />);

    await userEvent.selectOptions(screen.getByRole("combobox"), "declined");

    expect(changeMock).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Why is this closing?")).toBeInTheDocument();
  });
});
