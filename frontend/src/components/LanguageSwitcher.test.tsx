import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LanguageSwitcher from "./LanguageSwitcher";
import ProgressBar from "./ProgressBar";
import { setLang } from "../i18n/store";

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    setLang("he");
  });

  it("switches the UI language of other components live", () => {
    render(
      <>
        <LanguageSwitcher />
        <ProgressBar step={1} />
      </>,
    );

    // Starts in Hebrew.
    expect(screen.getByText("הזנת טקסט")).toBeInTheDocument();

    // Switch to English.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "en" } });
    expect(screen.getByText("Enter text")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("ltr");

    // Switch to French.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fr" } });
    expect(screen.getByText("Saisir le texte")).toBeInTheDocument();
  });
});
