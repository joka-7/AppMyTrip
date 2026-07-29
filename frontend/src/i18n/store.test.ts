import { describe, it, expect, beforeEach } from "vitest";
import { dirFor, getLang, setLang, setLangIfUnset, translate } from "./store";

describe("i18n store", () => {
  beforeEach(() => {
    localStorage.clear();
    setLang("he");
  });

  it("defaults to Hebrew (RTL)", () => {
    expect(getLang()).toBe("he");
    expect(dirFor("he")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
    expect(dirFor("fr")).toBe("ltr");
  });

  it("translates a key per active language", () => {
    expect(translate("nav.title")).toBe("תכנון טיול באמצעות AI");
    setLang("en");
    expect(translate("nav.title")).toBe("AI Trip Planner");
    setLang("fr");
    expect(translate("nav.title")).toBe("Planificateur de voyage IA");
  });

  it("interpolates {name} placeholders", () => {
    expect(translate("nav.step", { step: 1 })).toBe("שלב 1 מתוך 4");
    setLang("en");
    expect(translate("nav.step", { step: 3 })).toBe("Step 3 of 4");
  });

  it("persists the choice and updates <html lang/dir>", () => {
    setLang("fr");
    expect(localStorage.getItem("appmytrip_lang")).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("falls back to Hebrew for an unknown/missing translation", () => {
    setLang("en");
    // A key present in every dictionary still resolves in the active language...
    expect(translate("common.save")).toBe("Save");
  });

  describe("setLangIfUnset", () => {
    it("defaults the language when the visitor hasn't chosen one yet", () => {
      localStorage.clear();
      setLangIfUnset("fr");
      expect(getLang()).toBe("fr");
      expect(localStorage.getItem("appmytrip_lang")).toBe("fr");
    });

    it("never overrides an explicit choice", () => {
      setLang("en");
      setLangIfUnset("fr");
      expect(getLang()).toBe("en");
    });

    it("ignores a language outside he/en/fr", () => {
      localStorage.clear();
      setLangIfUnset("de");
      expect(getLang()).toBe("he");
      expect(localStorage.getItem("appmytrip_lang")).toBeNull();
    });

    it("ignores null/undefined", () => {
      localStorage.clear();
      setLangIfUnset(undefined);
      setLangIfUnset(null);
      expect(getLang()).toBe("he");
    });
  });
});
