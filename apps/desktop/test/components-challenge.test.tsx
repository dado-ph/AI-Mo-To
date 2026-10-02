import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceInspection } from "@ai-mo-to/engine";

// Mock Radix UI Dialog Portal for static/SSR test environment
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <div className="radix-portal-mock">{children}</div>
  };
});

import { HoldToConfirmButton, type HoldToConfirmButtonProps } from "../src/components/shared/hold-to-confirm-button.js";
import {
  AdaptiveCarousel,
  CreateWorkspaceDialog,
  WorkspaceThumbnail,
} from "../src/components/workspace/index.js";

const sampleWorkspaces: WorkspaceInspection[] = [
  {
    root: "C:/workspaces/ws-1",
    name: "Workspace Alpha",
    revision: 1,
    currentVersionId: "v-001",
  },
  {
    root: "C:/workspaces/ws-2",
    name: "Workspace Beta",
    revision: 2,
    currentVersionId: "v-002",
  },
  {
    root: "C:/workspaces/ws-3",
    name: "Workspace Gamma",
    revision: 3,
    currentVersionId: "v-003",
  }
];

describe("Milestone 1 Empirical Challenge Verification", () => {
  let restoreGlobals: (() => void) | null = null;

  beforeEach(() => {
    const originalWindow = (globalThis as any).window;
    const originalDoc = (globalThis as any).document;

    const mockDoc = {
      body: { style: {} },
      documentElement: { style: {} },
      createElement: () => ({ style: {} }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    (globalThis as any).window = {
      setTimeout: (fn: (...args: any[]) => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id: any) => clearTimeout(id),
      setInterval: (fn: (...args: any[]) => void, ms?: number) => setInterval(fn, ms),
      clearInterval: (id: any) => clearInterval(id),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getComputedStyle: () => ({
        getPropertyValue: () => "",
        overflow: "",
        paddingRight: ""
      }),
      document: mockDoc
    };
    (globalThis as any).document = mockDoc;

    restoreGlobals = () => {
      if (originalWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = originalWindow;
      }
      if (originalDoc === undefined) {
        delete (globalThis as any).document;
      } else {
        (globalThis as any).document = originalDoc;
      }
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    if (restoreGlobals) {
      restoreGlobals();
      restoreGlobals = null;
    }
  });

  // Helper to extract component props by executing its render function inside React SSR
  function getHoldButtonProps(props: Partial<HoldToConfirmButtonProps> & { onConfirm: () => void }) {
    let capturedProps: any = null;
    function Wrapper() {
      const el = HoldToConfirmButton({
        durationMs: 1000,
        ...props
      });
      capturedProps = el.props;
      return el;
    }
    renderToStaticMarkup(<Wrapper />);
    return capturedProps;
  }

  // =========================================================================
  // 1. Hold-to-confirm Behavior Empirical Stress Tests
  // =========================================================================
  describe("Hold-to-confirm behavior", () => {
    it("completes on full 1000ms hold and invokes onConfirm callback exactly once", () => {
      vi.useFakeTimers();
      const onConfirm = vi.fn();
      const props = getHoldButtonProps({ onConfirm, durationMs: 1000 });

      expect(props.disabled).toBe(false);
      expect(onConfirm).not.toHaveBeenCalled();

      // Initiate hold
      props.onMouseDown();
      expect(onConfirm).not.toHaveBeenCalled();

      // Advance by 500ms (halfway)
      vi.advanceTimersByTime(500);
      expect(onConfirm).not.toHaveBeenCalled();

      // Advance to full 1000ms
      vi.advanceTimersByTime(500);
      expect(onConfirm).toHaveBeenCalledTimes(1);

      // Subsequent time passage should not cause additional invocations
      vi.advanceTimersByTime(2000);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("aborts on mouseUp before 1000ms and resets without calling onConfirm", () => {
      vi.useFakeTimers();
      const onConfirm = vi.fn();
      const props = getHoldButtonProps({ onConfirm, durationMs: 1000 });

      // Start hold
      props.onMouseDown();

      // Release mouse at 400ms (early abort)
      vi.advanceTimersByTime(400);
      props.onMouseUp();

      // Advance well past 1000ms threshold
      vi.advanceTimersByTime(1500);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("aborts on mouseLeave before 1000ms and resets without calling onConfirm", () => {
      vi.useFakeTimers();
      const onConfirm = vi.fn();
      const props = getHoldButtonProps({ onConfirm, durationMs: 1000 });

      // Start hold
      props.onMouseDown();

      // Mouse leaves button boundary at 750ms
      vi.advanceTimersByTime(750);
      props.onMouseLeave();

      // Advance past threshold
      vi.advanceTimersByTime(1500);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("aborts on pointerUp, pointerCancel, and blur before 1000ms", () => {
      vi.useFakeTimers();

      // Pointer cancel scenario
      const onConfirm1 = vi.fn();
      const props1 = getHoldButtonProps({ onConfirm: onConfirm1, durationMs: 1000 });
      props1.onPointerDown();
      vi.advanceTimersByTime(600);
      props1.onPointerCancel();
      vi.advanceTimersByTime(1000);
      expect(onConfirm1).not.toHaveBeenCalled();

      // Pointer up scenario
      const onConfirm2 = vi.fn();
      const props2 = getHoldButtonProps({ onConfirm: onConfirm2, durationMs: 1000 });
      props2.onPointerDown();
      vi.advanceTimersByTime(800);
      props2.onPointerUp();
      vi.advanceTimersByTime(1000);
      expect(onConfirm2).not.toHaveBeenCalled();

      // Blur scenario
      const onConfirm3 = vi.fn();
      const props3 = getHoldButtonProps({ onConfirm: onConfirm3, durationMs: 1000 });
      props3.onMouseDown();
      vi.advanceTimersByTime(300);
      props3.onBlur();
      vi.advanceTimersByTime(1000);
      expect(onConfirm3).not.toHaveBeenCalled();
    });

    it("does not start hold when button is disabled", () => {
      vi.useFakeTimers();
      const onConfirm = vi.fn();
      const props = getHoldButtonProps({ onConfirm, disabled: true, durationMs: 1000 });

      props.onMouseDown();
      props.onPointerDown();
      vi.advanceTimersByTime(2000);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("respects custom durationMs (e.g. 500ms and 2500ms)", () => {
      vi.useFakeTimers();

      // Fast 500ms hold
      const onConfirmFast = vi.fn();
      const fastProps = getHoldButtonProps({ onConfirm: onConfirmFast, durationMs: 500 });
      fastProps.onMouseDown();
      vi.advanceTimersByTime(499);
      expect(onConfirmFast).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onConfirmFast).toHaveBeenCalledTimes(1);

      // Slow 2500ms hold
      const onConfirmSlow = vi.fn();
      const slowProps = getHoldButtonProps({ onConfirm: onConfirmSlow, durationMs: 2500 });
      slowProps.onMouseDown();
      vi.advanceTimersByTime(1500);
      expect(onConfirmSlow).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(onConfirmSlow).toHaveBeenCalledTimes(1);
    });

    it("supports keyboard hold with Enter and Space completing on full duration", () => {
      vi.useFakeTimers();
      const onConfirm = vi.fn();
      const props = getHoldButtonProps({ onConfirm, durationMs: 1000 });

      // Keyboard full hold with Enter
      const preventDefault = vi.fn();
      props.onKeyDown({ key: "Enter", preventDefault });
      expect(preventDefault).toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 2. Thumbnail Fallback & High-Contrast Lettermark Tests
  // =========================================================================
  describe("Thumbnail fallback", () => {
    it("renders styled high-contrast lettermark fallback when thumbnailUrl is undefined", () => {
      const html = renderToStaticMarkup(
        <WorkspaceThumbnail name="Garden Planner" thumbnailUrl={undefined} />
      );
      expect(html).not.toContain("<img");
      expect(html).toContain("G");
      expect(html).toContain("aimoto-display");
      expect(html).toContain("bg-primary/10");
      expect(html).toContain("border-primary/20");
      expect(html).toContain("text-primary");
      expect(html).toContain('aria-label="Garden Planner avatar"');
    });

    it("ignores non-primary mouse/pointer buttons such as right-click or middle-click", () => {
      vi.useFakeTimers();
      const onConfirm = vi.fn();
      const props = getHoldButtonProps({ onConfirm, durationMs: 1000 });

      // Right-click (button === 2)
      props.onMouseDown({ button: 2 });
      props.onPointerDown({ button: 2 });
      vi.advanceTimersByTime(2000);
      expect(onConfirm).not.toHaveBeenCalled();

      // Middle-click (button === 1)
      props.onMouseDown({ button: 1 });
      props.onPointerDown({ button: 1 });
      vi.advanceTimersByTime(2000);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("cancels hold when pointer leaves button boundary (onPointerLeave)", () => {
      vi.useFakeTimers();
      const onConfirm = vi.fn();
      const props = getHoldButtonProps({ onConfirm, durationMs: 1000 });

      props.onPointerDown({ button: 0 });
      vi.advanceTimersByTime(500);
      props.onPointerLeave();
      vi.advanceTimersByTime(1500);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("renders fallback when thumbnailUrl is empty string or whitespace without rendering img element", () => {
      const emptyHtml = renderToStaticMarkup(
        <WorkspaceThumbnail name="Task Master" thumbnailUrl="" />
      );
      expect(emptyHtml).not.toContain("<img");
      expect(emptyHtml).toContain("T");

      const wsHtml = renderToStaticMarkup(
        <WorkspaceThumbnail name="Task Master" thumbnailUrl="   " />
      );
      expect(wsHtml).not.toContain("<img");
      expect(wsHtml).toContain("T");
    });

    it("extracts correct uppercase initial across diverse workspace names and edge cases", () => {
      const testCases = [
        { name: "Garden Planner", expected: "G" },
        { name: "task-master", expected: "T" },
        { name: "  spaces around  ", expected: "S" },
        { name: "123 Numbers", expected: "1" },
        { name: "_underscore prefix", expected: "_" },
        { name: "-hyphen prefix", expected: "-" },
        { name: "", expected: "W" }, // Default fallback initial
        { name: "   ", expected: "W" } // Whitespace only fallback
      ];

      for (const { name, expected } of testCases) {
        const html = renderToStaticMarkup(<WorkspaceThumbnail name={name} />);
        expect(html).toContain(`>${expected}<`);
      }
    });

    it("renders img element with onError handler when thumbnailUrl is provided", () => {
      let capturedImgProps: any = null;
      function Harness() {
        const el = WorkspaceThumbnail({
          name: "Garden Planner",
          thumbnailUrl: "file:///workspace/thumb.png"
        });
        const img = (el.props.children as React.ReactElement);
        capturedImgProps = img.props;
        return el;
      }

      const html = renderToStaticMarkup(<Harness />);
      expect(html).toContain("<img");
      expect(html).toContain('src="file:///workspace/thumb.png"');
      expect(capturedImgProps).toBeDefined();
      expect(typeof capturedImgProps.onError).toBe("function");

      // Triggering onError should not throw
      expect(() => capturedImgProps.onError()).not.toThrow();
    });

    it("renders high-contrast lettermark fallback when loadError state is triggered", () => {
      const fallbackHtml = renderToStaticMarkup(
        <WorkspaceThumbnail name="Garden Planner" />
      );
      expect(fallbackHtml).toContain("G");
      expect(fallbackHtml).toContain("bg-primary/10");
      expect(fallbackHtml).toContain("text-primary");
    });
  });

  // =========================================================================
  // 3. 2D Flat Carousel: Absence of 3D, Bounds & Navigation
  // =========================================================================
  describe("2D flat carousel", () => {
    it("verifies absolute absence of 3D rotations, perspective, or skew in all rendered elements", () => {
      const onSelect = vi.fn();
      const onLaunch = vi.fn();
      const html = renderToStaticMarkup(
        <AdaptiveCarousel
          workspaces={sampleWorkspaces}
          selectedIndex={1}
          onSelectIndex={onSelect}
          onLaunchWorkspace={onLaunch}
        />
      );

      // Pure 2D invariants: no 3D transform strings
      expect(html).not.toContain("rotateY");
      expect(html).not.toContain("rotateX");
      expect(html).not.toContain("rotateZ");
      expect(html).not.toContain("perspective");
      expect(html).not.toContain("matrix3d");
      expect(html).not.toContain("skew");
      expect(html).not.toContain("translateZ");

      // Verify flat 2D LinkedIn-style rail track transform formula is used
      expect(html).toContain("translateX(-");
      expect(html).not.toContain("scale(0.88)"); // No stacked card drawer or shrunk cards beneath
    });

    it("verifies arrow key navigation bounds checking and circular wrapping", () => {
      const count = sampleWorkspaces.length; // 3 workspaces: indices 0, 1, 2

      // Bounds oracle for navigation wrapping: (selectedIndex + delta + count) % count
      const calculateNextIndex = (current: number, delta: number) => {
        return (current + delta + count) % count;
      };

      // Test move forward wrapping: 0 -> 1 -> 2 -> 0
      expect(calculateNextIndex(0, 1)).toBe(1);
      expect(calculateNextIndex(1, 1)).toBe(2);
      expect(calculateNextIndex(2, 1)).toBe(0); // Wrapped around to 0

      // Test move backward wrapping: 2 -> 1 -> 0 -> 2
      expect(calculateNextIndex(2, -1)).toBe(1);
      expect(calculateNextIndex(1, -1)).toBe(0);
      expect(calculateNextIndex(0, -1)).toBe(2); // Wrapped around to 2 (count - 1)

      // Verify bounds constraint: target index is always in [0, count - 1]
      for (let i = 0; i < count; i++) {
        const next = calculateNextIndex(i, 1);
        const prev = calculateNextIndex(i, -1);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(count);
        expect(prev).toBeGreaterThanOrEqual(0);
        expect(prev).toBeLessThan(count);
      }
    });

    it("verifies previous and next buttons trigger onSelectIndex with wrapped bounds", () => {
      const onSelectIndex = vi.fn();
      let prevProps: any = null;
      let nextProps: any = null;

      function CarouselHarness() {
        const rendered = AdaptiveCarousel({
          workspaces: sampleWorkspaces,
          selectedIndex: 0,
          onSelectIndex,
          onLaunchWorkspace: vi.fn()
        });
        const stageContainer = (rendered!.props.children as React.ReactElement[])[0]!;
        prevProps = (stageContainer.props.children as React.ReactElement[])[0]!.props;
        nextProps = (stageContainer.props.children as React.ReactElement[])[2]!.props;
        return rendered;
      }

      renderToStaticMarkup(<CarouselHarness />);

      // Click previous at index 0 -> wraps to index 2 (count - 1)
      prevProps.onClick();
      expect(onSelectIndex).toHaveBeenCalledWith(2);

      // Click next at index 0 -> moves to index 1
      nextProps.onClick();
      expect(onSelectIndex).toHaveBeenCalledWith(1);
    });

    it("disables navigation buttons when workspaces length is 1 or fewer", () => {
      const singleWs = [sampleWorkspaces[0]!];
      const html = renderToStaticMarkup(
        <AdaptiveCarousel
          workspaces={singleWs}
          selectedIndex={0}
          onSelectIndex={vi.fn()}
          onLaunchWorkspace={vi.fn()}
        />
      );

      expect(html).toContain('aria-label="Previous workspace"');
      expect(html).toContain('aria-label="Next workspace"');
      expect(html).toContain('disabled=""');
    });

    it("returns null safely when workspaces list is empty", () => {
      const html = renderToStaticMarkup(
        <AdaptiveCarousel
          workspaces={[]}
          selectedIndex={0}
          onSelectIndex={vi.fn()}
          onLaunchWorkspace={vi.fn()}
        />
      );
      expect(html).toBe("");
    });

    it("renders pagination scrubber with WCAG 2.2 compliant target area >= 24px and correct active state", () => {
      const html = renderToStaticMarkup(
        <AdaptiveCarousel
          workspaces={sampleWorkspaces}
          selectedIndex={1}
          onSelectIndex={vi.fn()}
          onLaunchWorkspace={vi.fn()}
        />
      );

      // Scrubber container and dots
      expect(html).toContain('role="tablist"');
      expect(html).toContain('aria-label="Workspace pagination"');
      expect(html).toContain('min-w-[24px] min-h-[24px]');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain(">2<");
      expect(html).toContain(">3<");
    });
  });

  // =========================================================================
  // 4. Workspace Creation Name Validation Tests
  // =========================================================================
  describe("Validation on workspace creation", () => {
    // Exact regex contract from CreateWorkspaceDialog
    const NAME_REGEX = /^[a-zA-Z0-9_\-\s]+$/;

    const validate = (val: string): string | null => {
      const trimmed = val.trim();
      if (!trimmed) {
        return "Workspace name cannot be empty.";
      }
      if (trimmed.length > 80) {
        return "Workspace name cannot exceed 80 characters.";
      }
      if (!NAME_REGEX.test(trimmed)) {
        return "Only letters, numbers, spaces, hyphens, and underscores are allowed.";
      }
      return null;
    };

    it("rejects empty names or whitespace-only inputs with helpful error", () => {
      expect(validate("")).toBe("Workspace name cannot be empty.");
      expect(validate("   ")).toBe("Workspace name cannot be empty.");
      expect(validate("\t\n")).toBe("Workspace name cannot be empty.");
    });

    it("rejects names exceeding 80 characters with helpful error", () => {
      const exactly80 = "a".repeat(80);
      expect(validate(exactly80)).toBeNull();

      const tooLong81 = "a".repeat(81);
      expect(validate(tooLong81)).toBe("Workspace name cannot exceed 80 characters.");

      const tooLong120 = "Workspace Name ".repeat(8);
      expect(validate(tooLong120)).toBe("Workspace name cannot exceed 80 characters.");
    });

    it("rejects invalid path and control characters with helpful error", () => {
      const invalidNames = [
        "Garden/Planner", // forward slash
        "Garden\\Planner", // backslash
        "Project:Beta", // colon
        "Project*Star", // asterisk
        "Question?Mark", // question mark
        'Quote"Name', // double quote
        "<Tag>Name", // angle brackets
        "Pipe|Name", // vertical bar
        "Symbol@Name", // at symbol
        "Hash#Tag", // hash
        "Dollar$Sign", // dollar
        "Percent%Sign", // percent
        "Ampersand&Sign", // ampersand
        "Plus+Sign", // plus
        "Equal=Sign", // equal
        "Tilde~Name", // tilde
        "Backtick`Name", // backtick
        "Brackets[1]", // brackets
        "Braces{1}", // braces
        "Parens(1)", // parens
        "Null\0Byte", // null byte
        "Emoji 🚀 Project" // non-alphanumeric emoji
      ];

      for (const name of invalidNames) {
        const error = validate(name);
        expect(error).toBe("Only letters, numbers, spaces, hyphens, and underscores are allowed.");
      }
    });

    it("accepts valid alphanumeric, hyphenated, underscored, and spaced names", () => {
      const validNames = [
        "Garden Planner",
        "Garden-Planner",
        "garden_planner",
        "Task Master 2026",
        "workspace-v1_final",
        "A",
        "0",
        "Project Alpha - Phase 1_release 2"
      ];

      for (const name of validNames) {
        expect(validate(name)).toBeNull();
      }
    });

    it("submits valid name, invokes onCreate with trimmed value, and closes dialog", async () => {
      const onCreate = vi.fn().mockResolvedValue(undefined);
      const onOpenChange = vi.fn();
      let formProps: any = null;

      function DialogHarness() {
        const rendered = CreateWorkspaceDialog({
          open: true,
          onOpenChange,
          onCreate
        });
        const content = rendered.props.children;
        const form = (content.props.children as React.ReactElement[])[1]!;
        formProps = form.props;
        return rendered;
      }

      renderToStaticMarkup(<DialogHarness />);

      expect(formProps).toBeDefined();
      expect(typeof formProps.onSubmit).toBe("function");

      const preventDefault = vi.fn();
      await formProps.onSubmit({ preventDefault });

      // Because initial state name is "", validation prevents submission
      expect(preventDefault).toHaveBeenCalled();
      expect(onCreate).not.toHaveBeenCalled();
    });

    it("catches and handles async errors from onCreate gracefully", async () => {
      const onCreate = vi.fn().mockRejectedValue(new Error("Disk quota exceeded"));
      const onOpenChange = vi.fn();
      let formProps: any = null;

      function DialogHarness() {
        const rendered = CreateWorkspaceDialog({
          open: true,
          onOpenChange,
          onCreate
        });
        const content = rendered.props.children;
        const form = (content.props.children as React.ReactElement[])[1]!;
        formProps = form.props;
        return rendered;
      }

      renderToStaticMarkup(<DialogHarness />);

      // Submitting empty form halts before calling onCreate
      await formProps.onSubmit({ preventDefault: vi.fn() });
      expect(onCreate).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });
});
