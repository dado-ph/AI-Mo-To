import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { DesktopWorkspaceVersion } from "../src/contracts.js";

// Mock Radix UI Dialog Portal so children render synchronously in static SSR test environment
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <div className="radix-portal-mock">{children}</div>
  };
});

import { HoldToConfirmButton } from "../src/components/shared/hold-to-confirm-button.js";
import {
  AdaptiveCarousel,
  CreateWorkspaceDialog,
  VersionHistoryDialog,
  WorkspaceCard,
  WorkspaceHub,
  WorkspaceListView,
  WorkspaceRunnerView,
  WorkspaceThumbnail,
} from "../src/components/workspace/index.js";
import { HeaderNavigation } from "../src/components/layout/header-navigation.js";

const sampleWorkspaces: WorkspaceInspection[] = [
  {
    root: "C:/workspaces/garden-planner",
    name: "Garden Planner",
    revision: 3,
    currentVersionId: "v-003",
  },
  {
    root: "C:/workspaces/task-master",
    name: "Task Master",
    revision: 1,
    currentVersionId: "v-001",
  }
];

const sampleVersions: DesktopWorkspaceVersion[] = [
  {
    schemaVersion: 1,
    versionId: "v-003",
    workspaceId: "ws-1",
    revision: 3,
    createdAt: "2026-09-30T10:00:00Z",
    message: "Added sprinkler zone controls",
    parentVersionId: "v-002",
    fileManifestDigest: "sha256:abc1234567"
  },
  {
    schemaVersion: 1,
    versionId: "v-002",
    workspaceId: "ws-1",
    revision: 2,
    createdAt: "2026-09-29T15:00:00Z",
    message: "Initial garden bed layout",
    parentVersionId: "v-001",
    fileManifestDigest: "sha256:def7890123"
  }
];

describe("WorkspaceThumbnail", () => {
  it("renders an image element when thumbnailUrl is provided", () => {
    const html = renderToStaticMarkup(
      <WorkspaceThumbnail
        name="Garden Planner"
        thumbnailUrl="file:///path/to/thumb.png"
      />
    );
    expect(html).toContain("<img");
    expect(html).toContain('src="file:///path/to/thumb.png"');
    expect(html).toContain('alt="Garden Planner thumbnail"');
  });

  it("renders a styled high-contrast lettermark fallback when thumbnailUrl is absent", () => {
    const html = renderToStaticMarkup(
      <WorkspaceThumbnail name="Garden Planner" />
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("G");
    expect(html).toContain("aimoto-display");
    expect(html).toContain("bg-primary/10");
  });

  it("handles empty name gracefully with a fallback initial", () => {
    const html = renderToStaticMarkup(
      <WorkspaceThumbnail name="" />
    );
    expect(html).toContain("W");
  });
});


describe("HoldToConfirmButton", () => {
  it("renders with default label and Trash2 icon", () => {
    const onConfirm = vi.fn();
    const html = renderToStaticMarkup(
      <HoldToConfirmButton onConfirm={onConfirm} />
    );
    expect(html).toContain("Delete");
    expect(html).toContain("text-destructive");
  });

  it("renders with custom label and disabled attribute when disabled", () => {
    const onConfirm = vi.fn();
    const html = renderToStaticMarkup(
      <HoldToConfirmButton onConfirm={onConfirm} label="Unregister Space" disabled={true} />
    );
    expect(html).toContain("Unregister Space");
    expect(html).toContain("disabled");
  });
});

describe("VersionHistoryDialog", () => {
  it("renders snapshot list with revisions, IDs, and messages when open", () => {
    const html = renderToStaticMarkup(
      <VersionHistoryDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceName="Garden Planner"
        workspaceRoot="C:/workspaces/garden-planner"
        currentVersionId="v-003"
        currentRevision={3}
        versions={sampleVersions}
        onRestore={vi.fn()}
      />
    );
    expect(html).toContain("Version History");
    expect(html).toContain("Garden Planner");
    expect(html).toContain("rev 3");
    expect(html).toContain("rev 2");
    expect(html).toContain("Added sprinkler zone controls");
    expect(html).toContain("Initial garden bed layout");
    expect(html).toContain("v-003");
  });

  it("renders empty state message when versions list is empty", () => {
    const html = renderToStaticMarkup(
      <VersionHistoryDialog
        open={true}
        onOpenChange={vi.fn()}
        workspaceName="Garden Planner"
        workspaceRoot="C:/workspaces/garden-planner"
        versions={[]}
        onRestore={vi.fn()}
      />
    );
    expect(html).toContain("No approved versions yet");
  });
});

describe("CreateWorkspaceDialog", () => {
  it("renders modal form with title, input, and create button when open", () => {
    const html = renderToStaticMarkup(
      <CreateWorkspaceDialog
        open={true}
        onOpenChange={vi.fn()}
        onCreate={vi.fn()}
      />
    );
    expect(html).toContain("New Workspace");
    expect(html).toContain("Workspace Name");
    expect(html).toContain("Create Workspace");
  });
});

describe("AdaptiveCarousel", () => {
  it("renders flat 2D horizontal stage with zero 3D transforms", () => {
    const html = renderToStaticMarkup(
      <AdaptiveCarousel
        workspaces={sampleWorkspaces}
        selectedIndex={0}
        onSelectIndex={vi.fn()}
        onLaunchWorkspace={vi.fn()}
        presentations={{
          "C:/workspaces/garden-planner": { thumbnailUrl: "file:///thumb.png" }
        }}
      />
    );
    // Verified: zero 3D perspective, zero rotateY, pure 2D
    expect(html).not.toContain("rotateY");
    expect(html).not.toContain("perspective");
    expect(html).not.toContain("matrix3d");
    expect(html).toContain("Garden Planner");
    expect(html).toContain("Task Master");
    expect(html).toContain("rev 3");
    expect(html).toContain("Workspace");
    expect(html).toContain(">1<");
    expect(html).toContain(">2<");
  });

  it("returns null when workspaces list is empty", () => {
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

  it("adapts card size and viewport positioning when embedded CLI is not active (hidden)", () => {
    const html = renderToStaticMarkup(
      <AdaptiveCarousel
        workspaces={sampleWorkspaces}
        selectedIndex={0}
        onSelectIndex={vi.fn()}
        onLaunchWorkspace={vi.fn()}
        terminalStage="hidden"
      />
    );
    expect(html).toContain('data-terminal-stage="hidden"');
    expect(html).toContain('data-size-responsive="true"');
    // Generous viewport-responsive width including large monitor expansion
    expect(html).toContain("max-w-xl sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl");
    expect(html).toContain("2xl:max-w-6xl");
    // Responsive aspect ratio and viewport height clamp without dead space
    expect(html).toContain("max-h-[min(52vh,540px)]");
    expect(html).toContain("2xl:max-h-[min(58vh,640px)]");
    expect(html).toContain("flex-1 justify-center min-h-0");
    // Clears floating >_ terminal button to prevent scrubber overlap
    expect(html).toContain("pb-20 sm:pb-24");
  });

  it("adapts card size and spacing when embedded CLI is active in partial stage", () => {
    const html = renderToStaticMarkup(
      <AdaptiveCarousel
        workspaces={sampleWorkspaces}
        selectedIndex={0}
        onSelectIndex={vi.fn()}
        onLaunchWorkspace={vi.fn()}
        terminalStage="partial"
      />
    );
    expect(html).toContain('data-terminal-stage="partial"');
    // Clears terminal height to prevent occlusion
    expect(html).toContain("pb-[300px] sm:pb-[320px]");
    // Compact card frame width
    expect(html).toContain("max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl");
    // Compact thumbnail canvas height
    expect(html).toContain("max-h-[min(26vh,240px)]");
  });

  it("adapts card size to compact header in full terminal stage", () => {
    const html = renderToStaticMarkup(
      <AdaptiveCarousel
        workspaces={sampleWorkspaces}
        selectedIndex={0}
        onSelectIndex={vi.fn()}
        onLaunchWorkspace={vi.fn()}
        terminalStage="full"
      />
    );
    expect(html).toContain('data-terminal-stage="full"');
    // Clearance for 72vh full terminal
    expect(html).toContain("pb-[74vh]");
    // Ultra-compact card frame width and canvas height
    expect(html).toContain("max-w-md sm:max-w-lg md:max-w-xl");
    expect(html).toContain("max-h-[min(12vh,110px)]");
  });

  it("preserves exactOptionalPropertyTypes compliance with explicit undefined props", () => {
    const html = renderToStaticMarkup(
      <AdaptiveCarousel
        workspaces={sampleWorkspaces}
        selectedIndex={0}
        onSelectIndex={vi.fn()}
        onLaunchWorkspace={vi.fn()}
        presentations={undefined}
        className={undefined}
        terminalStage={undefined}
      />
    );
    expect(html).toContain('data-terminal-stage="hidden"');
    expect(html).toContain("Garden Planner");
  });

  it("handles single workspace with disabled navigation controls and responsive card", () => {
    const single = [sampleWorkspaces[0]!];
    const html = renderToStaticMarkup(
      <AdaptiveCarousel
        workspaces={single}
        selectedIndex={0}
        onSelectIndex={vi.fn()}
        onLaunchWorkspace={vi.fn()}
        terminalStage="hidden"
      />
    );
    expect(html).toContain('aria-label="Previous workspace"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('data-size-responsive="true"');
    expect(html).toContain("Garden Planner");
  });

  it("strictly preserves workspace preview thumbnail and fallback lettermark under all terminal stages", () => {
    const stages: Array<"hidden" | "partial" | "full"> = ["hidden", "partial", "full"];
    for (const stage of stages) {
      // With thumbnail
      const htmlWithThumb = renderToStaticMarkup(
        <AdaptiveCarousel
          workspaces={sampleWorkspaces}
          selectedIndex={0}
          onSelectIndex={vi.fn()}
          onLaunchWorkspace={vi.fn()}
          presentations={{
            "C:/workspaces/garden-planner": { thumbnailUrl: "file:///thumb.png" }
          }}
          terminalStage={stage}
        />
      );
      expect(htmlWithThumb).toContain("<img");
      expect(htmlWithThumb).toContain('src="file:///thumb.png"');

      // Without thumbnail (fallback lettermark)
      const htmlFallback = renderToStaticMarkup(
        <AdaptiveCarousel
          workspaces={sampleWorkspaces}
          selectedIndex={0}
          onSelectIndex={vi.fn()}
          onLaunchWorkspace={vi.fn()}
          presentations={{}}
          terminalStage={stage}
        />
      );
      expect(htmlFallback).not.toContain('src="file:///thumb.png"');
      expect(htmlFallback).toContain("aimoto-display");
      expect(htmlFallback).toContain("G");
    }
  });
});

describe("WorkspaceCard", () => {
  it("renders prominent thumbnail, revision badge, path, and action buttons", () => {
    const html = renderToStaticMarkup(
      <WorkspaceCard
        workspace={sampleWorkspaces[0]!}
        presentation={{ thumbnailUrl: "file:///thumb.png" }}
        isActive={true}
        onLaunch={vi.fn()}
        onOpenFolder={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onViewVersions={vi.fn()}
      />
    );
    expect(html).toContain("Garden Planner");
    expect(html).toContain("rev 3");
    expect(html).toContain("Active");
    expect(html).toContain("C:/workspaces/garden-planner");
    expect(html).toContain("Launch");
    expect(html).toContain("Versions");
    expect(html).toContain("Delete");
  });
});

describe("WorkspaceListView", () => {
  it("renders compact tabular rows with preview, name, revision, and actions", () => {
    const html = renderToStaticMarkup(
      <WorkspaceListView
        workspaces={sampleWorkspaces}
        activeWorkspaceRoot="C:/workspaces/garden-planner"
        onLaunch={vi.fn()}
        onOpenFolder={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onViewVersions={vi.fn()}
      />
    );
    expect(html).toContain("Garden Planner");
    expect(html).toContain("Task Master");
    expect(html).toContain("rev 3");
    expect(html).toContain("rev 1");
    expect(html).toContain("Directory Location");
    expect(html).toContain("Actions");
  });
});

describe("WorkspaceHub", () => {
  it("renders card grid in grid view mode", () => {
    const html = renderToStaticMarkup(
      <WorkspaceHub
        workspaces={sampleWorkspaces}
        viewMode="grid"
        onLaunch={vi.fn()}
      />
    );
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("Garden Planner");
    expect(html).toContain("Task Master");
  });

  it("renders list view in list view mode", () => {
    const html = renderToStaticMarkup(
      <WorkspaceHub
        workspaces={sampleWorkspaces}
        viewMode="list"
        onLaunch={vi.fn()}
      />
    );
    expect(html).toContain("<table");
    expect(html).toContain("Garden Planner");
    expect(html).toContain("Task Master");
  });

  it("renders search empty state when searchQuery produces 0 results", () => {
    const html = renderToStaticMarkup(
      <WorkspaceHub
        workspaces={[]}
        viewMode="grid"
        searchQuery="nonexistent"
        onClearSearch={vi.fn()}
        onLaunch={vi.fn()}
      />
    );
    expect(html).toContain("No workspaces found");
    expect(html).toContain("nonexistent");
    expect(html).toContain("Clear Search Query");
  });

  it("renders zero workspaces registered empty state when empty and no search query", () => {
    const html = renderToStaticMarkup(
      <WorkspaceHub
        workspaces={[]}
        viewMode="grid"
        onNewWorkspace={vi.fn()}
        onImportWorkspace={vi.fn()}
        onLaunch={vi.fn()}
      />
    );
    expect(html).toContain("No workspaces yet");
    expect(html).toContain("Create Workspace");
    expect(html).toContain("Import Folder");
  });
});

describe("WorkspaceRunnerView", () => {
  it("renders top toolbar with switcher, reload, version badge, and guided empty state when entryUrl is missing", () => {
    const html = renderToStaticMarkup(
      <WorkspaceRunnerView
        workspace={sampleWorkspaces[0]!}
        allWorkspaces={sampleWorkspaces}
        onBack={vi.fn()}
        onSelectWorkspace={vi.fn()}
        onOpenFolder={vi.fn()}
        onViewVersions={vi.fn()}
      />
    );
    expect(html).toContain("Back");
    expect(html).toContain("Garden Planner");
    expect(html).toContain("rev 3");
    expect(html).toContain("Reload");
    expect(html).toContain("No application entrypoint found");
    expect(html).toContain("Open in File Explorer");
  });

  it("renders embedded iframe when entryUrl is provided", () => {
    const html = renderToStaticMarkup(
      <WorkspaceRunnerView
        workspace={sampleWorkspaces[0]!}
        allWorkspaces={sampleWorkspaces}
        presentation={{ entryUrl: "file:///path/to/index.html" }}
        onBack={vi.fn()}
        onSelectWorkspace={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );
    expect(html).toContain("<iframe");
    expect(html).toContain('src="file:///path/to/index.html"');
  });
});

describe("HeaderNavigation", () => {
  it("renders brand, real-time search input, view mode buttons, and primary actions", () => {
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
        workspaceCount={2}
      />
    );
    expect(html).toContain("AIMOTO");
    expect(html).toContain('placeholder="Search workspaces..."');
    expect(html).toContain('value="test"');
    expect(html).toContain("New Workspace");
    expect(html).toContain("Import");
    expect(html).toContain("Switch to light mode");
  });
});
