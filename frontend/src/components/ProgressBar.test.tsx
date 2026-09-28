import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProgressBar from "./ProgressBar";

describe("ProgressBar", () => {
  it("marks the current step with aria-current", () => {
    render(<ProgressBar step={2} maxStepReached={2} onStepClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: /2/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /1/ })).not.toHaveAttribute("aria-current");
  });

  // Regression guard: a step already visited (its content still exists,
  // since going back doesn't clear later steps' state) should be reachable
  // again by clicking its circle.
  it("navigates to an already-reached step on click", () => {
    const onStepClick = vi.fn();
    render(<ProgressBar step={3} maxStepReached={3} onStepClick={onStepClick} />);

    fireEvent.click(screen.getByRole("button", { name: /1/ }));
    expect(onStepClick).toHaveBeenCalledWith(1);
  });

  it("does not navigate into a step beyond the furthest one reached", () => {
    const onStepClick = vi.fn();
    render(<ProgressBar step={1} maxStepReached={1} onStepClick={onStepClick} />);

    const step4Button = screen.getByRole("button", { name: /4/ });
    expect(step4Button).toBeDisabled();
    fireEvent.click(step4Button);
    expect(onStepClick).not.toHaveBeenCalled();
  });
});
