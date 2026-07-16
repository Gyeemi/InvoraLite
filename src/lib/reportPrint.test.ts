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
    vi.restoreAllMocks();
  });

  it("writes HTML into an off-screen iframe and prints", () => {
    const printMock = vi.fn();
    const focusMock = vi.fn();
    const openMock = vi.fn();
    const writeMock = vi.fn();
    const closeMock = vi.fn();

    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = originalCreate(tagName);
      if (tagName.toLowerCase() === "iframe") {
        Object.defineProperty(element, "contentWindow", {
          configurable: true,
          value: {
            document: {
              open: openMock,
              write: writeMock,
              close: closeMock,
            },
            focus: focusMock,
            print: printMock,
          },
        });
      }
      return element;
    });

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    printHtmlDocument("<html><body>Report</body></html>");

    const iframe = document.querySelector("iframe[data-invora-print]") as HTMLIFrameElement | null;
    expect(iframe).toBeTruthy();
    expect(iframe?.style.width).toBe("794px");
    expect(openMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalled();

    vi.runAllTimers();
    expect(focusMock).toHaveBeenCalled();
    expect(printMock).toHaveBeenCalled();
  });
});
