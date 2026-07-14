// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { printHtmlDocument } from "./reportPrint";

describe("printHtmlDocument", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("creates a hidden iframe and writes HTML into it", () => {
    const printMock = vi.fn();
    const focusMock = vi.fn();

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = document.createElementNS("http://www.w3.org/1999/xhtml", tagName) as HTMLElement;
      if (tagName.toLowerCase() === "iframe") {
        Object.defineProperty(element, "contentWindow", {
          value: {
            document: {
              open: vi.fn(),
              write: vi.fn(),
              close: vi.fn(),
            },
            focus: focusMock,
            print: printMock,
          },
        });
      }
      return element;
    });

    printHtmlDocument("<html><body>Report</body></html>");

    const iframe = document.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.style.visibility).toBe("hidden");

    vi.runAllTimers();
    expect(printMock).toHaveBeenCalled();
  });
});
