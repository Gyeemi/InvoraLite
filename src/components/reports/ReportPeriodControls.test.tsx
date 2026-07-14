import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportPeriodControls } from "./ReportPeriodControls";

describe("ReportPeriodControls", () => {
  it("renders monthly accounting period picker", () => {
    render(
      <ReportPeriodControls
        mode="monthly"
        periodKey="2026-06"
        onPeriodKeyChange={vi.fn()}
        fiscalStartMonth={1}
        fiscalYear={2026}
        onFiscalYearChange={vi.fn()}
        onFiscalStartMonthChange={vi.fn()}
        onFiscalPreset={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Accounting period")).toHaveValue("2026-06");
    expect(screen.queryByLabelText("Fiscal year starts")).not.toBeInTheDocument();
  });

  it("shows period closed badge for monthly mode", () => {
    render(
      <ReportPeriodControls
        mode="monthly"
        periodKey="2026-06"
        onPeriodKeyChange={vi.fn()}
        fiscalStartMonth={1}
        fiscalYear={2026}
        onFiscalYearChange={vi.fn()}
        onFiscalStartMonthChange={vi.fn()}
        onFiscalPreset={vi.fn()}
        periodClosed
      />,
    );

    expect(screen.getByText("Period closed")).toBeInTheDocument();
  });

  it("renders annual fiscal controls and presets", () => {
    render(
      <ReportPeriodControls
        mode="annual"
        periodKey="2026-06"
        onPeriodKeyChange={vi.fn()}
        fiscalStartMonth={7}
        fiscalYear={2025}
        onFiscalYearChange={vi.fn()}
        onFiscalStartMonthChange={vi.fn()}
        onFiscalPreset={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Fiscal year starts")).toHaveValue("2025-07");
    expect(screen.getByLabelText("Fiscal year")).toHaveValue(2025);
    expect(screen.getByRole("button", { name: "Jul – Jun" })).toHaveClass("text-accent-purple");
    expect(screen.getByRole("button", { name: "Jan – Dec" })).toBeInTheDocument();
  });

  it("calls onPeriodKeyChange when month input changes", () => {
    const onPeriodKeyChange = vi.fn();

    render(
      <ReportPeriodControls
        mode="monthly"
        periodKey="2026-06"
        onPeriodKeyChange={onPeriodKeyChange}
        fiscalStartMonth={1}
        fiscalYear={2026}
        onFiscalYearChange={vi.fn()}
        onFiscalStartMonthChange={vi.fn()}
        onFiscalPreset={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Accounting period"), { target: { value: "2025-03" } });
    expect(onPeriodKeyChange).toHaveBeenCalledWith("2025-03");
  });

  it("calls onFiscalPreset when a preset is clicked", async () => {
    const user = userEvent.setup();
    const onFiscalPreset = vi.fn();

    render(
      <ReportPeriodControls
        mode="annual"
        periodKey="2026-06"
        onPeriodKeyChange={vi.fn()}
        fiscalStartMonth={1}
        fiscalYear={2026}
        onFiscalYearChange={vi.fn()}
        onFiscalStartMonthChange={vi.fn()}
        onFiscalPreset={onFiscalPreset}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Jul – Jun" }));
    expect(onFiscalPreset).toHaveBeenCalledWith(7);
  });
});
