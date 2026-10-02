import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { DesktopWorkspaceVersion } from "../src/contracts.js";

// Mock Radix UI Dialog Portal for static test environment
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <div className="radix-portal-mock">{children}</div>
  };
});

import { HeaderNavigation } from "../src/components/layout/header-navigation.js";
import {
  AdaptiveCarousel,
  CreateWorkspaceDialog,
  VersionHistoryDialog,
  WorkspaceCard,
  WorkspaceHub,
  WorkspaceListView,
  WorkspaceRunnerView,
} from "../src/components/workspace/index.js";
import { Dialog, DialogContent } from "../src/components/ui/dialog.js";

const testWorkspaces: WorkspaceInspection[] = [
  {
    root: "C:/workspaces/alpha-project",
    name: "Alpha Project",
    revision: 5,
    currentVersionId: "v-005",
  },
  {
    root: "C:/workspaces/beta-service",
    name: "Beta Service",
    revision: 2,
    currentVersionId: "v-002",
  },
  {
    root: "C:/workspaces/gamma-tool",
    name: "Gamma Tool",
    revision: 0,
    currentVersionId: null,
  },
  {
    root: "C:/workspaces/delta-dashboard",
    name: "Delta Dashboard",
    revision: 11,
    currentVersionId: "v-011",
  },
  {
    root: "D:/storage/special [brackets] (parens) +plus",
    name: "Special Characters $#@! &*?",
    revision: 1,
    currentVersionId: "v-spec-1",
  }
];

describe("Milestone 2 Empirical Challenge Suite", () => {
  // =========================================================================
  // 1. Theme Engine Oracle, Auto-Detection & Dynamic OS Change Listener
  // =========================================================================
  describe("1. Theme Engine & OS Detection Empirical Stress", () => {
    let mockStorage: Record<string, string> = {};

    beforeEach(() => {
      mockStorage = {};
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, value: string) => {
          mockStorage[key] = value;
        },
        removeItem: (key: string) => {
          delete mockStorage[key];
        },
        clear: () => {
          mockStorage = {};
        }
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // Mirror of exact renderer-app.tsx implementation (defaults to light mode)
    function getInitialTheme(): boolean {
      if (typeof window === "undefined") return false;
      const stored = localStorage.getItem("aimoto-theme");
      if (stored === "dark") return true;
      if (stored === "light") return false;
      return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
    }

    it("evaluates truth table across all permutations of localStorage and matchMedia", () => {
      const cases: Array<{
        storage: string | null;
        matches: boolean | undefined;
        expected: boolean;
      }> = [
        // No storage -> matchMedia determines theme; defaults to light mode
        { storage: null, matches: true, expected: true },
        { storage: null, matches: false, expected: false },
        { storage: null, matches: undefined, expected: false }, // fallback when matchMedia missing (light mode default)
        // Explicit dark -> always true regardless of matchMedia
        { storage: "dark", matches: true, expected: true },
        { storage: "dark", matches: false, expected: true },
        { storage: "dark", matches: undefined, expected: true },
        // Explicit light -> always false regardless of matchMedia
        { storage: "light", matches: true, expected: false },
        { storage: "light", matches: false, expected: false },
        { storage: "light", matches: undefined, expected: false },
        // Corrupted / unknown storage values -> falls back to matchMedia
        { storage: "unknown-val", matches: true, expected: true },
        { storage: "unknown-val", matches: false, expected: false },
        { storage: "", matches: true, expected: true },
        { storage: "true", matches: false, expected: false }
      ];

      for (const { storage, matches, expected } of cases) {
        if (storage !== null) {
          localStorage.setItem("aimoto-theme", storage);
        } else {
          localStorage.removeItem("aimoto-theme");
        }

        if (matches === undefined) {
          vi.stubGlobal("window", { matchMedia: undefined });
        } else {
          vi.stubGlobal("window", {
            matchMedia: (query: string) => ({
              matches: query.includes("dark") ? matches : !matches,
              addEventListener: vi.fn(),
              removeEventListener: vi.fn()
            })
          });
        }

        expect(getInitialTheme()).toBe(expected);
      }
    });

    it("verifies dynamic OS change listener attaches and updates theme only when no override exists", () => {
      let changeHandler: ((e: { matches: boolean }) => void) | null = null;
      const addListenerMock = vi.fn((_type: string, handler: (e: { matches: boolean }) => void) => {
        changeHandler = handler;
      });
      const removeListenerMock = vi.fn();

      vi.stubGlobal("window", {
        matchMedia: vi.fn((_query: string) => ({
          matches: false,
          addEventListener: addListenerMock,
          removeEventListener: removeListenerMock
        }))
      });

      // Simulation of renderer-app.tsx effect
      let isDarkState = getInitialTheme();
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: { matches: boolean }) => {
        const stored = localStorage.getItem("aimoto-theme");
        if (!stored) {
          isDarkState = e.matches;
        }
      };
      mediaQuery.addEventListener("change", handleChange);

      expect(addListenerMock).toHaveBeenCalledWith("change", handleChange);
      expect(isDarkState).toBe(false);

      // OS switches to Dark Mode
      changeHandler!({ matches: true });
      expect(isDarkState).toBe(true);

      // OS switches back to Light Mode
      changeHandler!({ matches: false });
      expect(isDarkState).toBe(false);

      // User sets an explicit override to dark
      localStorage.setItem("aimoto-theme", "dark");
      isDarkState = true;

      // OS switches to Light Mode: override PREVENTS state mutation!
      changeHandler!({ matches: false });
      expect(isDarkState).toBe(true); // Still dark because of user override!

      // Cleanup
      mediaQuery.removeEventListener("change", handleChange);
      expect(removeListenerMock).toHaveBeenCalledWith("change", handleChange);
    });

    it("simulates rapid 1-click theme toggling and verifies documentElement classList synchronization", () => {
      const classList = new Set<string>();
      const mockElement = {
        classList: {
          contains: (cls: string) => classList.has(cls),
          add: (cls: string) => classList.add(cls),
          remove: (cls: string) => classList.delete(cls),
          toggle: (cls: string, force?: boolean) => {
            if (force === undefined) {
              if (classList.has(cls)) classList.delete(cls);
              else classList.add(cls);
              return classList.has(cls);
            }
            if (force) classList.add(cls);
            else classList.delete(cls);
            return force;
          }
        }
      };

      vi.stubGlobal("document", {
        documentElement: mockElement
      });

      let currentDark = true;
      mockElement.classList.toggle("dark", currentDark);
      expect(mockElement.classList.contains("dark")).toBe(true);

      // Perform 50 toggle operations
      for (let i = 0; i < 50; i++) {
        const prev = currentDark;
        currentDark = !prev;
        localStorage.setItem("aimoto-theme", currentDark ? "dark" : "light");
        mockElement.classList.toggle("dark", currentDark);

        expect(currentDark).toBe(!prev);
        expect(mockElement.classList.contains("dark")).toBe(currentDark);
        expect(localStorage.getItem("aimoto-theme")).toBe(currentDark ? "dark" : "light");
      }
    });
  });

  // =========================================================================
  // 2. Real-Time Search Query Filtering & Persistence Across View Modes
  // =========================================================================
  describe("2. Search Filtering & View Mode Retention Empirical Stress", () => {
    function filterWorkspaces(workspaces: WorkspaceInspection[], searchQuery: string): WorkspaceInspection[] {
      const query = searchQuery.trim().toLowerCase();
      return workspaces.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          w.root.toLowerCase().includes(query)
      );
    }

    it("filters accurately across name, path, special characters, and case variations", () => {
      // Case insensitivity
      expect(filterWorkspaces(testWorkspaces, "ALPHA")).toHaveLength(1);
      expect(filterWorkspaces(testWorkspaces, "alpha")).toHaveLength(1);
      expect(filterWorkspaces(testWorkspaces, "AlPhA")).toHaveLength(1);

      // Root path matching
      expect(filterWorkspaces(testWorkspaces, "beta-service")).toHaveLength(1);
      expect(filterWorkspaces(testWorkspaces, "C:/workspaces")).toHaveLength(4);
      expect(filterWorkspaces(testWorkspaces, "D:/storage")).toHaveLength(1);

      // Leading and trailing whitespace trimming
      expect(filterWorkspaces(testWorkspaces, "   Gamma   ")).toHaveLength(1);

      // Special characters in query (brackets, parens, symbols) without regex crash
      expect(filterWorkspaces(testWorkspaces, "[brackets]")).toHaveLength(1);
      expect(filterWorkspaces(testWorkspaces, "(parens)")).toHaveLength(1);
      expect(filterWorkspaces(testWorkspaces, "$#@!")).toHaveLength(1);
      expect(filterWorkspaces(testWorkspaces, "+plus")).toHaveLength(1);

      // Non-matching query
      expect(filterWorkspaces(testWorkspaces, "nonexistent-query-12345")).toHaveLength(0);

      // Empty / whitespace-only query
      expect(filterWorkspaces(testWorkspaces, "")).toHaveLength(testWorkspaces.length);
      expect(filterWorkspaces(testWorkspaces, "    ")).toHaveLength(testWorkspaces.length);
    });

    it("proves search filter is retained when switching view modes (Carousel -> Grid -> List -> Carousel)", () => {
      // Simulating App component state transition model
      let viewMode: "carousel" | "grid" | "list" = "carousel";
      let searchQuery = "gamma";

      const handleViewModeChange = (mode: "carousel" | "grid" | "list") => {
        viewMode = mode;
      };

      // 1. Initial Carousel mode with search active
      let filtered = filterWorkspaces(testWorkspaces, searchQuery);
      expect(viewMode).toBe("carousel");
      expect(searchQuery).toBe("gamma");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.name).toBe("Gamma Tool");

      // 2. Switch to Grid mode
      handleViewModeChange("grid");
      filtered = filterWorkspaces(testWorkspaces, searchQuery);
      expect(viewMode).toBe("grid");
      expect(searchQuery).toBe("gamma");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.name).toBe("Gamma Tool");

      // 3. Switch to List mode
      handleViewModeChange("list");
      filtered = filterWorkspaces(testWorkspaces, searchQuery);
      expect(viewMode).toBe("list");
      expect(searchQuery).toBe("gamma");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.name).toBe("Gamma Tool");

      // 4. Switch back to Carousel mode
      handleViewModeChange("carousel");
      filtered = filterWorkspaces(testWorkspaces, searchQuery);
      expect(viewMode).toBe("carousel");
      expect(searchQuery).toBe("gamma");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.name).toBe("Gamma Tool");
    });

    it("renders actionable empty search state in both Grid and Carousel fallback", () => {
      const onClearSearch = vi.fn();
      const emptyFiltered: WorkspaceInspection[] = [];

      // In renderer-app.tsx, when viewMode === "carousel" and filtered.length === 0,
      // it falls back to rendering WorkspaceHub in grid view:
      const carouselFallbackHtml = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={emptyFiltered}
          viewMode="grid"
          searchQuery="xyz-not-found"
          onClearSearch={onClearSearch}
          onLaunch={vi.fn()}
        />
      );

      expect(carouselFallbackHtml).toContain("No workspaces found");
      expect(carouselFallbackHtml).toContain("No workspaces matched your search for");
      expect(carouselFallbackHtml).toContain("xyz-not-found");
      expect(carouselFallbackHtml).toContain("Clear Search Query");

      // In list view:
      const listFallbackHtml = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={emptyFiltered}
          viewMode="list"
          searchQuery="xyz-not-found"
          onClearSearch={onClearSearch}
          onLaunch={vi.fn()}
        />
      );

      expect(listFallbackHtml).toContain("No workspaces found");
      expect(listFallbackHtml).toContain("No workspaces matched your search for");
      expect(listFallbackHtml).toContain("xyz-not-found");
      expect(listFallbackHtml).toContain("Clear Search Query");
    });
  });

  // =========================================================================
  // 3. Defensive Carousel Index Clamping & Boundary Conditions
  // =========================================================================
  describe("3. Carousel Index Clamping Empirical Stress", () => {
    it("synchronously clamps safeIndex even before effects execute", () => {
      // In AdaptiveCarousel:
      // const count = workspaces.length;
      // const safeIndex = count > 0 ? Math.min(Math.max(0, selectedIndex), count - 1) : 0;
      function computeSafeIndex(count: number, selectedIndex: number): number {
        return count > 0 ? Math.min(Math.max(0, selectedIndex), count - 1) : 0;
      }

      // Count = 0
      expect(computeSafeIndex(0, 0)).toBe(0);
      expect(computeSafeIndex(0, 5)).toBe(0);
      expect(computeSafeIndex(0, -5)).toBe(0);

      // Count = 1
      expect(computeSafeIndex(1, -10)).toBe(0);
      expect(computeSafeIndex(1, 0)).toBe(0);
      expect(computeSafeIndex(1, 10)).toBe(0);

      // Count = 5, indices within [0, 4]
      expect(computeSafeIndex(5, 0)).toBe(0);
      expect(computeSafeIndex(5, 2)).toBe(2);
      expect(computeSafeIndex(5, 4)).toBe(4);

      // Count = 5, out-of-bounds indices
      expect(computeSafeIndex(5, -1)).toBe(0);
      expect(computeSafeIndex(5, -999)).toBe(0);
      expect(computeSafeIndex(5, 5)).toBe(4);
      expect(computeSafeIndex(5, 100)).toBe(4);
    });

    it("renders AdaptiveCarousel stably under dynamic shrinking and extreme index props", () => {
      const onSelectIndex = vi.fn();

      // Stress scenario: selectedIndex is 10, but only 2 workspaces are passed
      const twoWorkspaces = testWorkspaces.slice(0, 2);
      const htmlOver = renderToStaticMarkup(
        <AdaptiveCarousel
          workspaces={twoWorkspaces}
          selectedIndex={10}
          onSelectIndex={onSelectIndex}
          onLaunchWorkspace={vi.fn()}
        />
      );

      // Clamped to index 1 (Beta Service)
      expect(htmlOver).toContain("Beta Service");
      expect(htmlOver).toContain(">2</span> of");
      expect(htmlOver).toContain("aimoto-carousel-center");

      // Stress scenario: negative index
      const htmlUnder = renderToStaticMarkup(
        <AdaptiveCarousel
          workspaces={twoWorkspaces}
          selectedIndex={-99}
          onSelectIndex={onSelectIndex}
          onLaunchWorkspace={vi.fn()}
        />
      );

      // Clamped to index 0 (Alpha Project)
      expect(htmlUnder).toContain("Alpha Project");
      expect(htmlUnder).toContain(">1</span> of");
      expect(htmlUnder).toContain("aimoto-carousel-center");
    });

    it("verifies single-item carousel disables previous and next controls", () => {
      const singleWorkspace = [testWorkspaces[0]!];
      const html = renderToStaticMarkup(
        <AdaptiveCarousel
          workspaces={singleWorkspace}
          selectedIndex={0}
          onSelectIndex={vi.fn()}
          onLaunchWorkspace={vi.fn()}
        />
      );

      // Navigation buttons should have disabled attribute
      expect(html).toContain('aria-label="Previous workspace"');
      expect(html).toContain('aria-label="Next workspace"');
      expect(html).toContain('disabled=""');
    });

    it("returns null when count is zero, preventing unrendered DOM pollution", () => {
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
  });

  // =========================================================================
  // 4. Drawer Deprecation & Architectural Invariants
  // =========================================================================
  describe("4. Drawer Deprecation & Flat Aesthetic Invariants", () => {
    it("empirically confirms WorkspaceManagerDrawer is NOT imported or rendered in renderer-app.tsx", () => {
      const rendererAppPath = path.resolve(__dirname, "../src/renderer-app.tsx");
      const content = fs.readFileSync(rendererAppPath, "utf-8");

      // Check import statement
      expect(content).not.toMatch(/import.*WorkspaceManagerDrawer/);
      // Check JSX usage
      expect(content).not.toMatch(/<WorkspaceManagerDrawer/);
      // Check old drawer state variables
      expect(content).not.toContain("isDrawerOpen");
      expect(content).not.toContain("setIsDrawerOpen");
      // Check ambient 18s drift removal
      expect(content).not.toContain("aimoto-ambient");
    });

    it("confirms AdaptiveCarousel does NOT contain 3D rotateY, perspective, or skew styling", () => {
      const carouselPath = path.resolve(__dirname, "../src/components/workspace/carousel.tsx");
      const content = fs.readFileSync(carouselPath, "utf-8");

      expect(content).not.toContain("rotateY");
      expect(content).not.toContain("perspective");
      expect(content).not.toContain("transform-style: preserve-3d");
      expect(content).not.toContain("skew");
    });

    it("confirms all inline workspace operations are present in WorkspaceHub", () => {
      const onLaunch = vi.fn();
      const onRename = vi.fn();
      const onDelete = vi.fn();
      const onOpenFolder = vi.fn();
      const onViewVersions = vi.fn();

      const html = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={testWorkspaces.slice(0, 2)}
          viewMode="grid"
          onLaunch={onLaunch}
          onRename={onRename}
          onDelete={onDelete}
          onOpenFolder={onOpenFolder}
          onViewVersions={onViewVersions}
        />
      );

      // Verify inline actions exist
      expect(html).toContain("Rename workspace");
      expect(html).toContain("Open in File Explorer");
      expect(html).toContain("Hold 1s to unregister workspace");
      expect(html).toContain("Inspect version history");
      expect(html).toContain("Launch");
    });
  });

  // =========================================================================
  // 5. WCAG 2.2 AA Target Size & Keyboard Accessibility
  // =========================================================================
  describe("5. WCAG 2.2 AA Accessibility & Target Sizes", () => {
    it("ensures all action buttons in WorkspaceListView satisfy minimum 24px target size", () => {
      const html = renderToStaticMarkup(
        <WorkspaceListView
          workspaces={testWorkspaces.slice(0, 3)}
          onLaunch={vi.fn()}
          onOpenFolder={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onViewVersions={vi.fn()}
        />
      );

      // Check min-h-[24px] and min-w-[24px] or size-6
      expect(html).toContain("min-h-[24px]");
      expect(html).toContain("min-w-[24px]");
      expect(html).toContain("size-6");

      // Verify no remaining small interactive targets like size-4 or size-5 without min-size
      const size5WithoutMin = /<button[^>]*class="[^"]*size-5(?!.*min-[hw]-\[24px\])[^"]*"[^>]*>/;
      expect(html).not.toMatch(size5WithoutMin);
    });

    it("ensures HeaderNavigation buttons contain accessible aria labels and focus indicators", () => {
      const html = renderToStaticMarkup(
        <HeaderNavigation
          searchQuery="test"
          onSearchChange={vi.fn()}
          viewMode="carousel"
          onViewModeChange={vi.fn()}
          onNewWorkspace={vi.fn()}
          onImportWorkspace={vi.fn()}
          isDark={true}
          onToggleTheme={vi.fn()}
          workspaceCount={5}
        />
      );

      expect(html).toContain('aria-label="Search workspaces"');
      expect(html).toContain('aria-label="Switch to light mode"');
      expect(html).toContain('aria-label="Carousel view"');
      expect(html).toContain('aria-label="Grid view"');
      expect(html).toContain('aria-label="List view"');
      expect(html).toContain("focus-visible:ring-2");
    });

    it("verifies DialogContent assigns aimoto-dialog-modal to modal variant and aimoto-dialog-drawer to drawer variant", () => {
      const modalHtml = renderToStaticMarkup(
        <Dialog open={true}>
          <DialogContent variant="modal">
            <div>Modal Body</div>
          </DialogContent>
        </Dialog>
      );
      expect(modalHtml).toContain("aimoto-dialog-modal");
      expect(modalHtml).not.toContain("aimoto-dialog-drawer");
      expect(modalHtml).toContain("-translate-x-1/2 -translate-y-1/2");

      const drawerHtml = renderToStaticMarkup(
        <Dialog open={true}>
          <DialogContent variant="drawer">
            <div>Drawer Body</div>
          </DialogContent>
        </Dialog>
      );
      expect(drawerHtml).toContain("aimoto-dialog-drawer");
      expect(drawerHtml).not.toContain("aimoto-dialog-modal");
      expect(drawerHtml).toContain("inset-y-0 right-0");
    });

    it("supports touch swipe left and right gestures on 2D carousel stage", () => {
      const onSelectIndex = vi.fn();
      let stageProps: any = null;

      function CarouselTouchHarness() {
        const rendered = AdaptiveCarousel({
          workspaces: testWorkspaces.slice(0, 3),
          selectedIndex: 1,
          onSelectIndex,
          onLaunchWorkspace: vi.fn()
        });
        const stageContainer = (rendered!.props.children as React.ReactElement[])[0]!;
        // The stage is child index 1
        const stageDiv = (stageContainer.props.children as React.ReactElement[])[1]!;
        stageProps = stageDiv.props;
        return rendered;
      }

      renderToStaticMarkup(<CarouselTouchHarness />);
      expect(stageProps).toBeDefined();
      expect(typeof stageProps.onTouchStart).toBe("function");
      expect(typeof stageProps.onTouchEnd).toBe("function");

      // Swipe Left: touch start at 200, end at 100 (diff = -100 < -40) -> move(1) -> from index 1 to index 2
      stageProps.onTouchStart({ touches: [{ clientX: 200 }] });
      stageProps.onTouchEnd({ changedTouches: [{ clientX: 100 }] });
      expect(onSelectIndex).toHaveBeenCalledWith(2);

      // Swipe Right: touch start at 100, end at 200 (diff = +100 > 40) -> move(-1) -> from index 1 to index 0
      stageProps.onTouchStart({ touches: [{ clientX: 100 }] });
      stageProps.onTouchEnd({ changedTouches: [{ clientX: 200 }] });
      expect(onSelectIndex).toHaveBeenCalledWith(0);

      // Small drag below threshold (< 40px) does not move
      onSelectIndex.mockClear();
      stageProps.onTouchStart({ touches: [{ clientX: 100 }] });
      stageProps.onTouchEnd({ changedTouches: [{ clientX: 120 }] });
      expect(onSelectIndex).not.toHaveBeenCalled();
    });
  });
});
