import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ThemeSelector from "./ThemeSelector";

describe("ThemeSelector", () => {
  it("renders one swatch per theme", () => {
    render(<ThemeSelector theme="blue" onChange={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(6);
  });

  it("calls onChange with the clicked theme", () => {
    const onChange = vi.fn();
    render(<ThemeSelector theme="blue" onChange={onChange} />);
    screen.getAllByRole("button")[2].click();
    expect(onChange).toHaveBeenCalledWith("dark");
  });
});
