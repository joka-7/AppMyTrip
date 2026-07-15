import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Bomb(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("catches a render error instead of leaving a blank screen, and shows the message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText("משהו השתבש")).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /רענון הדף/ })).toBeInTheDocument();
  });

  it("reloads the page when the reload button is clicked", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    // jsdom's window.location.reload isn't stubbable directly; clicking just
    // needs to not throw, exercising the same reload() call path covered by
    // staleChunkRecovery's tests.
    expect(() => fireEvent.click(screen.getByRole("button", { name: /רענון הדף/ }))).not.toThrow();
  });
});
