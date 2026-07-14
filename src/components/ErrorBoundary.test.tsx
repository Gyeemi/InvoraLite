// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): ReactNode {
  throw new Error("Test render failure");
}

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p>Healthy content</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Healthy content")).toBeInTheDocument();
  });

  it("shows recovery UI when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary title="Page failed">
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Page failed")).toBeInTheDocument();
    expect(screen.getByText("Test render failure")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload app" })).toBeInTheDocument();
  });

  it("recovers when Try again is clicked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    let shouldThrow = true;

    function MaybeBoom(): ReactNode {
      if (shouldThrow) throw new Error("Temporary failure");
      return <p>Recovered</p>;
    }

    render(
      <ErrorBoundary>
        <MaybeBoom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Temporary failure")).toBeInTheDocument();
    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });
});
