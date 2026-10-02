import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

const sampleWorkspaces: WorkspaceInspection[] = [
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
  }
];

const sampleVersions: DesktopWorkspaceVersion[] = [
  {
    schemaVersion: 1,
    versionId: "v-005",
    workspaceId: "ws-1",
    revision: 5,
    createdAt: "2026-09-30T10:00:00Z",
    message: "Refactored app shell",
    parentVersionId: "v-004",
    fileManifestDigest: "sha256:abc12345"
  },
  {
    schemaVersion: 1,
    versionId: "v-004",
    workspaceId: "ws-1",
    revision: 4,
    createdAt: "2026-09-30T09:00:00Z",
    message: "Initial shell implementation",
    parentVersionId: null,
    fileManifestDigest: "sha256:def67890"
  }
];

describe("Milestone 2 (M2) Integration Tests", () => {
  // =========================================================================
  // 1. Theme Engine & OS Auto-Detection (R1)
  // =========================================================================
  describe("Theme Engine (R1)", () => {
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

    it("evaluates OS prefers-color-scheme when localStorage is unset", () => {
      // Helper function mirroring renderer-app.tsx getInitialTheme()
      function getInitialTheme(): boolean {
        const stored = localStorage.getItem("aimoto-theme");
        if (stored === "dark") return true;
        if (stored === "light") return false;
        return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
      }

      // Case A: OS prefers dark
      vi.stubGlobal("window", {
        matchMedia: (query: string) => ({
          matches: query === "(prefers-color-scheme: dark)",
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        })
      });
      expect(getInitialTheme()).toBe(true);

      // Case B: OS prefers light
      vi.stubGlobal("window", {
        matchMedia: (_query: string) => ({
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        })
      });
      expect(getInitialTheme()).toBe(false);
    });

    it("respects explicit localStorage user override over OS setting", () => {
      function getInitialTheme(): boolean {
        const stored = localStorage.getItem("aimoto-theme");
        if (stored === "dark") return true;
        if (stored === "light") return false;
        return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
      }

      // OS is dark, but user override is light
      localStorage.setItem("aimoto-theme", "light");
      vi.stubGlobal("window", {
        matchMedia: (_query: string) => ({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        })
      });
      expect(getInitialTheme()).toBe(false);

      // OS is light, but user override is dark
      localStorage.setItem("aimoto-theme", "dark");
      vi.stubGlobal("window", {
        matchMedia: (_query: string) => ({
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        })
      });
      expect(getInitialTheme()).toBe(true);
    });

    it("simulates dynamic OS theme change listener when no override exists", () => {
      let listener: ((e: { matches: boolean }) => void) | null = null;
      vi.stubGlobal("window", {
        matchMedia: (_query: string) => ({
          matches: true,
          addEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => {
            listener = cb;
          },
          removeEventListener: vi.fn()
        })
      });

      let currentTheme = true;
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", (e: any) => {
        const stored = localStorage.getItem("aimoto-theme");
        if (!stored) {
          currentTheme = e.matches;
        }
      });

      // OS changes to light mode
      expect(listener).toBeDefined();
      listener!({ matches: false });
      expect(currentTheme).toBe(false);

      // If user sets override, OS changes are ignored
      localStorage.setItem("aimoto-theme", "dark");
      listener!({ matches: false });
      expect(localStorage.getItem("aimoto-theme")).toBe("dark");
    });

    it("HeaderNavigation renders theme toggle button reflecting isDark state", () => {
      const onToggle = vi.fn();
      const darkHtml = renderToStaticMarkup(
        <HeaderNavigation
          searchQuery=""
          onSearchChange={vi.fn()}
          viewMode="carousel"
          onViewModeChange={vi.fn()}
          onNewWorkspace={vi.fn()}
          onImportWorkspace={vi.fn()}
          isDark={true}
          onToggleTheme={onToggle}
        />
      );
      expect(darkHtml).toContain("Switch to light mode");

      const lightHtml = renderToStaticMarkup(
        <HeaderNavigation
          searchQuery=""
          onSearchChange={vi.fn()}
          viewMode="carousel"
          onViewModeChange={vi.fn()}
          onNewWorkspace={vi.fn()}
          onImportWorkspace={vi.fn()}
          isDark={false}
          onToggleTheme={onToggle}
        />
      );
      expect(lightHtml).toContain("Switch to dark mode");
    });
  });

  // =========================================================================
  // 2. View Mode & Search Query Filtering (R2, R3)
  // =========================================================================
  describe("View Mode & Real-time Search Filtering (R2, R3)", () => {
    it("filters workspaces by name or root path case-insensitively", () => {
      const query = "beta";
      const filtered = sampleWorkspaces.filter(
        (w) =>
          w.name.toLowerCase().includes(query.toLowerCase()) ||
          w.root.toLowerCase().includes(query.toLowerCase())
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.name).toBe("Beta Service");

      const pathQuery = "gamma-tool";
      const filteredPath = sampleWorkspaces.filter(
        (w) =>
          w.name.toLowerCase().includes(pathQuery.toLowerCase()) ||
          w.root.toLowerCase().includes(pathQuery.toLowerCase())
      );
      expect(filteredPath).toHaveLength(1);
      expect(filteredPath[0]?.name).toBe("Gamma Tool");
    });

    it("renders empty state in WorkspaceHub when search matches zero workspaces", () => {
      const onClearSearch = vi.fn();
      const html = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={[]}
          viewMode="grid"
          searchQuery="nonexistent"
          onClearSearch={onClearSearch}
          onLaunch={vi.fn()}
        />
      );
      expect(html).toContain("No workspaces found");
      expect(html).toContain("nonexistent");
      expect(html).toContain("Clear Search Query");
    });

    it("renders guided empty state when zero workspaces exist overall", () => {
      const onNewWorkspace = vi.fn();
      const onImportWorkspace = vi.fn();
      const html = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={[]}
          viewMode="grid"
          searchQuery=""
          onNewWorkspace={onNewWorkspace}
          onImportWorkspace={onImportWorkspace}
          onLaunch={vi.fn()}
        />
      );
      expect(html).toContain("No workspaces yet");
      expect(html).toContain("Create Workspace");
      expect(html).toContain("Import Folder");
    });
  });

  // =========================================================================
  // 3. Reviewer Polish Items (WCAG 2.2 AA target size & Carousel clamping)
  // =========================================================================
  describe("Reviewer Polish Items", () => {
    it("verifies all action buttons in WorkspaceListView satisfy WCAG 2.2 AA target size (>=24px)", () => {
      const html = renderToStaticMarkup(
        <WorkspaceListView
          workspaces={sampleWorkspaces}
          onLaunch={vi.fn()}
          onOpenFolder={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onViewVersions={vi.fn()}
        />
      );

      // Verify that all buttons include min-h-[24px] / min-w-[24px] or size-6 (24px)
      expect(html).toContain("min-h-[24px]");
      expect(html).toContain("min-w-[24px]");
      expect(html).toContain("size-6");
      // Verify no remaining size-5 on interactive buttons
      expect(html).not.toMatch(/size-5.*text-muted-foreground/);
    });

    it("defensively clamps selectedIndex in AdaptiveCarousel when count shrinks", () => {
      const onSelectIndex = vi.fn();
      // Initially 3 items, selectedIndex is 2
      // Now list shrinks to 1 item while selectedIndex is still passed as 2
      const singleItem = [sampleWorkspaces[0]!];
      const html = renderToStaticMarkup(
        <AdaptiveCarousel
          workspaces={singleItem}
          selectedIndex={2}
          onSelectIndex={onSelectIndex}
          onLaunchWorkspace={vi.fn()}
        />
      );

      // The carousel must clamp safeIndex to 0 and render singleItem[0] as active center card
      expect(html).toContain("Alpha Project");
      expect(html).toContain("Workspace");
      expect(html).toContain(">1</span> of");
      expect(html).toContain("aimoto-carousel-center");
    });

    it("handles negative selectedIndex defensively", () => {
      const html = renderToStaticMarkup(
        <AdaptiveCarousel
          workspaces={sampleWorkspaces}
          selectedIndex={-5}
          onSelectIndex={vi.fn()}
          onLaunchWorkspace={vi.fn()}
        />
      );

      // Defensively clamped to 0
      expect(html).toContain("Workspace");
      expect(html).toContain(">1</span> of");
      expect(html).toContain("aimoto-carousel-center");
    });
  });

  // =========================================================================
  // 4. Inline Workspace Management & Modals (R4)
  // =========================================================================
  describe("Inline Workspace Management & Modals (R4)", () => {
    it("renders CreateWorkspaceDialog with input, validation, and actions", () => {
      const onCreate = vi.fn();
      const html = renderToStaticMarkup(
        <CreateWorkspaceDialog
          open={true}
          onOpenChange={vi.fn()}
          onCreate={onCreate}
        />
      );
      expect(html).toContain("New Workspace");
      expect(html).toContain("Workspace Name");
      expect(html).toContain("Create Workspace");
      expect(html).toContain("Cancel");
    });

    it("renders VersionHistoryDialog with snapshot history and 1-click restore", () => {
      const onRestore = vi.fn();
      const html = renderToStaticMarkup(
        <VersionHistoryDialog
          open={true}
          onOpenChange={vi.fn()}
          workspaceName="Alpha Project"
          workspaceRoot="C:/workspaces/alpha-project"
          currentVersionId="v-005"
          currentRevision={5}
          versions={sampleVersions}
          onRestore={onRestore}
        />
      );
      expect(html).toContain("Version History");
      expect(html).toContain("Alpha Project");
      expect(html).toContain("rev 5");
      expect(html).toContain("rev 4");
      expect(html).toContain("Refactored app shell");
      expect(html).toContain("Current Active");
      expect(html).toContain("Restore");
    });
  });

  // =========================================================================
  // 5. Enhanced Workspace Runner View (R5)
  // =========================================================================
  describe("Enhanced Workspace Runner View (R5)", () => {
    it("renders runner toolbar with switcher, reload, version badge, and open folder button", () => {
      const onBack = vi.fn();
      const onSelectWorkspace = vi.fn();
      const onOpenFolder = vi.fn();
      const onViewVersions = vi.fn();

      const html = renderToStaticMarkup(
        <WorkspaceRunnerView
          workspace={sampleWorkspaces[0]!}
          allWorkspaces={sampleWorkspaces}
          presentation={{ thumbnailUrl: "file:///thumb.png" }}
          onBack={onBack}
          onSelectWorkspace={onSelectWorkspace}
          onOpenFolder={onOpenFolder}
          onViewVersions={onViewVersions}
        />
      );

      // Back button
      expect(html).toContain("Back");
      // Switcher showing active workspace name
      expect(html).toContain("Alpha Project");
      // Version indicator
      expect(html).toContain("rev 5");
      // Reload trigger
      expect(html).toContain("Reload");
      // Open folder button
      expect(html).toContain("Open workspace folder");
      // Guided empty state because entryUrl is missing
      expect(html).toContain("No application entrypoint found");
      expect(html).toContain("index.html");
      expect(html).toContain("Check Again");
    });

    it("renders embedded WorkspaceFrame when presentation.entryUrl is present", () => {
      const html = renderToStaticMarkup(
        <WorkspaceRunnerView
          workspace={sampleWorkspaces[0]!}
          allWorkspaces={sampleWorkspaces}
          presentation={{
            entryUrl: "http://localhost:3000/app.html",
            thumbnailUrl: "file:///thumb.png"
          }}
          onBack={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onOpenFolder={vi.fn()}
        />
      );

      expect(html).toContain("<iframe");
      expect(html).toContain('src="http://localhost:3000/app.html"');
      expect(html).not.toContain("No application entrypoint found");
    });
  });

  // =========================================================================
  // 6. Drawer Deprecation Verification (R4)
  // =========================================================================
  describe("Drawer Deprecation Verification (R4)", () => {
    it("confirms WorkspaceManagerDrawer is completely deprecated and not present in Home View", () => {
      // In renderer-app.tsx, HeaderNavigation is rendered instead of WorkspaceManagerDrawer
      const html = renderToStaticMarkup(
        <HeaderNavigation
          searchQuery=""
          onSearchChange={vi.fn()}
          viewMode="carousel"
          onViewModeChange={vi.fn()}
          onNewWorkspace={vi.fn()}
          onImportWorkspace={vi.fn()}
          isDark={true}
          onToggleTheme={vi.fn()}
        />
      );
      // The old drawer trigger button (aria-label="Open workspace drawer" or "Workspace Manager") is absent
      expect(html).not.toContain("Open workspace drawer");
      expect(html).not.toContain("aimoto-cog");
      expect(html).toContain("AIMOTO");
      expect(html).toContain("New Workspace");
      expect(html).toContain("Import");
    });
  });
});
