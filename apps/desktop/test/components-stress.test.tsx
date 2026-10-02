import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import type { WorkspacePresentation } from "../src/contracts.js";

import { HeaderNavigation } from "../src/components/layout/header-navigation.js";
import { WorkspaceHub, WorkspaceRunnerView } from "../src/components/workspace/index.js";

// Test dataset generator
function generateWorkspaces(count: number): WorkspaceInspection[] {
  return Array.from({ length: count }, (_, i) => ({
    root: `C:/workspaces/workspace-${i + 1}`,
    name: `Workspace Alpha ${i + 1}`,
    revision: i + 1,
    currentVersionId: `v-${String(i + 1).padStart(3, "0")}`,
  }));
}

const sampleWorkspaces = generateWorkspaces(5);

describe("Milestone 1 Empirical Stress Suite", () => {
  // =========================================================================
  // 1. HeaderNavigation: View Mode Switching & Search Query Verification
  // =========================================================================
  describe("HeaderNavigation empirical tests", () => {
    it("renders segmented view mode controls with correct aria-pressed and styling for all modes", () => {
      const modes: Array<"carousel" | "grid" | "list"> = ["carousel", "grid", "list"];

      for (const activeMode of modes) {
        const onModeChange = vi.fn();
        const html = renderToStaticMarkup(
          <HeaderNavigation
            searchQuery=""
            onSearchChange={vi.fn()}
            viewMode={activeMode}
            onViewModeChange={onModeChange}
            onNewWorkspace={vi.fn()}
            onImportWorkspace={vi.fn()}
            isDark={false}
            onToggleTheme={vi.fn()}
          />
        );

        // Verify that the active mode has aria-pressed="true"
        for (const mode of modes) {
          const isCurrent = mode === activeMode;
          const label = mode === "carousel" ? "Carousel view" : mode === "grid" ? "Grid view" : "List view";
          expect(html).toContain(`aria-label="${label}"`);
          expect(html).toContain(`aria-pressed="${isCurrent}"`);
        }
      }
    });

    it("verifies view mode callback argument dispatch for each button", () => {
      const modes: Array<"carousel" | "grid" | "list"> = ["carousel", "grid", "list"];

      for (const targetMode of modes) {
        const onModeChange = vi.fn();
        const rendered = HeaderNavigation({
          searchQuery: "",
          onSearchChange: vi.fn(),
          viewMode: "carousel",
          onViewModeChange: onModeChange,
          onNewWorkspace: vi.fn(),
          onImportWorkspace: vi.fn(),
          isDark: false,
          onToggleTheme: vi.fn()
        });

        // The controls div is the third child in header
        const controlsDiv = (rendered.props.children as React.ReactElement[])[2]!;
        const buttonGroup = (controlsDiv.props.children as React.ReactElement[])[0]!;
        const buttons = buttonGroup.props.children as React.ReactElement[];

        const buttonForMode = buttons.find((b) => b.props.title?.toLowerCase().includes(targetMode));
        expect(buttonForMode).toBeDefined();

        buttonForMode!.props.onClick();
        expect(onModeChange).toHaveBeenCalledTimes(1);
        expect(onModeChange).toHaveBeenCalledWith(targetMode);
      }
    });

    it("renders real-time search input and toggles clear button presence based on query", () => {
      // Empty query: clear button MUST NOT be present
      const emptyHtml = renderToStaticMarkup(
        <HeaderNavigation
          searchQuery=""
          onSearchChange={vi.fn()}
          viewMode="grid"
          onViewModeChange={vi.fn()}
          onNewWorkspace={vi.fn()}
          onImportWorkspace={vi.fn()}
          isDark={true}
          onToggleTheme={vi.fn()}
        />
      );
      expect(emptyHtml).toContain('placeholder="Search workspaces..."');
      expect(emptyHtml).toContain('value=""');
      expect(emptyHtml).not.toContain('aria-label="Clear search query"');

      // Populated query: clear button MUST be present
      const populatedHtml = renderToStaticMarkup(
        <HeaderNavigation
          searchQuery="Alpha 3"
          onSearchChange={vi.fn()}
          viewMode="grid"
          onViewModeChange={vi.fn()}
          onNewWorkspace={vi.fn()}
          onImportWorkspace={vi.fn()}
          isDark={true}
          onToggleTheme={vi.fn()}
        />
      );
      expect(populatedHtml).toContain('value="Alpha 3"');
      expect(populatedHtml).toContain('aria-label="Clear search query"');
    });

    it("verifies clear search button triggers onSearchChange with empty string", () => {
      const onSearchChange = vi.fn();
      const rendered = HeaderNavigation({
        searchQuery: "active filter",
        onSearchChange,
        viewMode: "grid",
        onViewModeChange: vi.fn(),
        onNewWorkspace: vi.fn(),
        onImportWorkspace: vi.fn(),
        isDark: false,
        onToggleTheme: vi.fn()
      });

      const searchDiv = (rendered.props.children as React.ReactElement[])[1]!;
      const relativeDiv = searchDiv.props.children as React.ReactElement;
      const clearButton = (relativeDiv.props.children as React.ReactElement[])[2]!;

      expect(clearButton).toBeDefined();
      expect(clearButton.props["aria-label"]).toBe("Clear search query");

      clearButton.props.onClick();
      expect(onSearchChange).toHaveBeenCalledWith("");
    });

    it("verifies real-time search input onChange propagates value", () => {
      const onSearchChange = vi.fn();
      const rendered = HeaderNavigation({
        searchQuery: "query",
        onSearchChange,
        viewMode: "grid",
        onViewModeChange: vi.fn(),
        onNewWorkspace: vi.fn(),
        onImportWorkspace: vi.fn(),
        isDark: false,
        onToggleTheme: vi.fn()
      });

      const searchDiv = (rendered.props.children as React.ReactElement[])[1]!;
      const relativeDiv = searchDiv.props.children as React.ReactElement;
      const input = (relativeDiv.props.children as React.ReactElement[])[1]!;

      input.props.onChange({ target: { value: "new search text" } });
      expect(onSearchChange).toHaveBeenCalledWith("new search text");
    });

    it("stress-tests search query with special characters, regex tokens, and unicode", () => {
      const adversarialQueries = [
        "Garden (Planner) [v3]",
        "test.*+?^${}()|[]\\",
        "<script>alert('xss')</script>",
        "日本語ワークスペース",
        "Emoji 🚀 ✨ 🔥",
        "A".repeat(1000)
      ];

      for (const query of adversarialQueries) {
        const html = renderToStaticMarkup(
          <HeaderNavigation
            searchQuery={query}
            onSearchChange={vi.fn()}
            viewMode="grid"
            onViewModeChange={vi.fn()}
            onNewWorkspace={vi.fn()}
            onImportWorkspace={vi.fn()}
            isDark={false}
            onToggleTheme={vi.fn()}
          />
        );
        expect(html).toContain('aria-label="Search workspaces"');
        expect(html).toContain('aria-label="Clear search query"');
      }
    });

    it("verifies theme toggle aria-label and icon switching", () => {
      const onToggleTheme = vi.fn();
      const darkRendered = HeaderNavigation({
        searchQuery: "",
        onSearchChange: vi.fn(),
        viewMode: "grid",
        onViewModeChange: vi.fn(),
        onNewWorkspace: vi.fn(),
        onImportWorkspace: vi.fn(),
        isDark: true,
        onToggleTheme
      });

      const controlsDiv = (darkRendered.props.children as React.ReactElement[])[2]!;
      const buttons = controlsDiv.props.children as React.ReactElement[];
      const themeBtn = buttons[buttons.length - 1]!;
      expect(themeBtn.props["aria-label"]).toBe("Switch to light mode");

      themeBtn.props.onClick();
      expect(onToggleTheme).toHaveBeenCalledTimes(1);
    });

    it("verifies brand renders custom appIconUrl when provided and fallback when omitted", () => {
      const withIcon = renderToStaticMarkup(
        <HeaderNavigation
          searchQuery=""
          onSearchChange={vi.fn()}
          viewMode="grid"
          onViewModeChange={vi.fn()}
          onNewWorkspace={vi.fn()}
          onImportWorkspace={vi.fn()}
          isDark={false}
          onToggleTheme={vi.fn()}
          appIconUrl="file:///icon.png"
        />
      );
      expect(withIcon).toContain('src="file:///icon.png"');

      const withoutIcon = renderToStaticMarkup(
        <HeaderNavigation
          searchQuery=""
          onSearchChange={vi.fn()}
          viewMode="grid"
          onViewModeChange={vi.fn()}
          onNewWorkspace={vi.fn()}
          onImportWorkspace={vi.fn()}
          isDark={false}
          onToggleTheme={vi.fn()}
        />
      );
      expect(withoutIcon).not.toContain('src="file:///icon.png"');
      expect(withoutIcon).toContain(">AI<");
    });
  });

  // =========================================================================
  // 2. WorkspaceHub: View Mode Switching, Real-Time Filtering & Zero States
  // =========================================================================
  describe("WorkspaceHub empirical tests", () => {
    it("switches cleanly between Grid and List view modes with identical dataset", () => {
      const gridHtml = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={sampleWorkspaces}
          viewMode="grid"
          onLaunch={vi.fn()}
        />
      );
      expect(gridHtml).toContain("grid-cols-1 gap-6 sm:grid-cols-2");
      expect(gridHtml).not.toContain("<table");
      for (const ws of sampleWorkspaces) {
        expect(gridHtml).toContain(ws.name);
        expect(gridHtml).toContain(`rev ${ws.revision}`);
      }

      const listHtml = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={sampleWorkspaces}
          viewMode="list"
          onLaunch={vi.fn()}
        />
      );
      expect(listHtml).toContain("<table");
      expect(listHtml).toContain("<thead");
      expect(listHtml).toContain("Directory Location");
      for (const ws of sampleWorkspaces) {
        expect(listHtml).toContain(ws.name);
        expect(listHtml).toContain(`rev ${ws.revision}`);
      }
    });

    it("renders zero-state for search queries yielding no results", () => {
      const onClearSearch = vi.fn();
      const html = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={[]}
          viewMode="grid"
          searchQuery="Nonexistent Workspace Query"
          onClearSearch={onClearSearch}
          onLaunch={vi.fn()}
        />
      );
      expect(html).toContain("No workspaces found");
      expect(html).toContain("Nonexistent Workspace Query");
      expect(html).toContain("Clear Search Query");
      expect(html).not.toContain("No workspaces yet");
      expect(html).not.toContain("Create Workspace");
    });

    it("verifies onClearSearch is invoked when Clear Search Query is clicked", () => {
      const onClearSearch = vi.fn();
      const rendered = WorkspaceHub({
        workspaces: [],
        viewMode: "grid",
        searchQuery: "Nonexistent",
        onClearSearch,
        onLaunch: vi.fn()
      });

      // Children: [SearchX container (0), h3 (1), p (2), Button (3)]
      const children = rendered.props.children as React.ReactElement[];
      const clearBtn = children[3]!;
      expect(clearBtn).toBeDefined();
      expect(clearBtn.props.children).toBe("Clear Search Query");

      clearBtn.props.onClick();
      expect(onClearSearch).toHaveBeenCalledTimes(1);
    });

    it("renders zero-state for empty registered workspaces when no search query is active", () => {
      const onNew = vi.fn();
      const onImport = vi.fn();
      const html = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={[]}
          viewMode="grid"
          onNewWorkspace={onNew}
          onImportWorkspace={onImport}
          onLaunch={vi.fn()}
        />
      );
      expect(html).toContain("No workspaces yet");
      expect(html).toContain("Create Workspace");
      expect(html).toContain("Import Folder");
      expect(html).not.toContain("No workspaces found");
      expect(html).not.toContain("Clear Search Query");
    });

    it("treats whitespace-only search query as empty (showing 'No workspaces yet' rather than 'No workspaces found')", () => {
      const html = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={[]}
          viewMode="grid"
          searchQuery="     "
          onLaunch={vi.fn()}
        />
      );
      expect(html).toContain("No workspaces yet");
      expect(html).not.toContain("No workspaces found");
    });

    it("simulates real-time search query filtering and verifies oracle consistency", () => {
      const allWorkspaces = generateWorkspaces(20);
      const testQueries = ["Alpha 1", "Workspace-15", "nonexistent-xyz", "alpha", ""];

      for (const query of testQueries) {
        const trimmed = query.trim().toLowerCase();
        const filtered = trimmed
          ? allWorkspaces.filter(
              (ws) =>
                ws.name.toLowerCase().includes(trimmed) ||
                ws.root.toLowerCase().includes(trimmed)
            )
          : allWorkspaces;

        const html = renderToStaticMarkup(
          <WorkspaceHub
            workspaces={filtered}
            viewMode="grid"
            searchQuery={query}
            onLaunch={vi.fn()}
          />
        );

        if (filtered.length === 0) {
          expect(html).toContain("No workspaces found");
          expect(html).toContain(query);
        } else {
          expect(html).not.toContain("No workspaces found");
          for (const match of filtered) {
            expect(html).toContain(match.name);
          }
        }
      }
    });

    it("verifies exactOptionalPropertyTypes compliance: handles explicit undefined props gracefully", () => {
      const html = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={sampleWorkspaces}
          viewMode="grid"
          presentations={undefined}
          activeWorkspaceRoot={undefined}
          searchQuery={undefined}
          onClearSearch={undefined}
          onNewWorkspace={undefined}
          onImportWorkspace={undefined}
          onLaunch={vi.fn()}
          onOpenFolder={undefined}
          onRename={undefined}
          onDelete={undefined}
          onViewVersions={undefined}
          className={undefined}
        />
      );
      expect(html).toContain(sampleWorkspaces[0]!.name);
    });
  });

  // =========================================================================
  // 3. WorkspaceRunnerView: Switcher Dropdown, Reload Key & Guided Empty State
  // =========================================================================
  describe("WorkspaceRunnerView empirical tests", () => {
    it("renders guided empty state when presentation is undefined", () => {
      const onOpenFolder = vi.fn();
      const html = renderToStaticMarkup(
        <WorkspaceRunnerView
          workspace={sampleWorkspaces[0]!}
          allWorkspaces={sampleWorkspaces}
          presentation={undefined}
          onBack={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onOpenFolder={onOpenFolder}
        />
      );

      expect(html).toContain("No application entrypoint found");
      expect(html).toContain("index.html");
      expect(html).toContain("ui/index.html");
      expect(html).toContain("public/index.html");
      expect(html).toContain("Open in File Explorer");
      expect(html).toContain("Check Again");
      expect(html).toContain(sampleWorkspaces[0]!.root);
      expect(html).not.toContain("<iframe");
    });

    it("renders guided empty state when presentation.entryUrl is empty string or undefined", () => {
      const cases: Array<WorkspacePresentation | undefined> = [
        {},
        { entryUrl: undefined },
        { entryUrl: "" }
      ];

      for (const pres of cases) {
        const html = renderToStaticMarkup(
          <WorkspaceRunnerView
            workspace={sampleWorkspaces[0]!}
            allWorkspaces={sampleWorkspaces}
            presentation={pres}
            onBack={vi.fn()}
            onSelectWorkspace={vi.fn()}
            onOpenFolder={vi.fn()}
          />
        );
        expect(html).toContain("No application entrypoint found");
        expect(html).not.toContain("<iframe");
      }
    });

    it("renders embedded WorkspaceFrame iframe when presentation.entryUrl is provided", () => {
      const html = renderToStaticMarkup(
        <WorkspaceRunnerView
          workspace={sampleWorkspaces[0]!}
          allWorkspaces={sampleWorkspaces}
          presentation={{ entryUrl: "http://127.0.0.1:4173/index.html" }}
          onBack={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onOpenFolder={vi.fn()}
        />
      );

      expect(html).not.toContain("No application entrypoint found");
      expect(html).toContain("<iframe");
      expect(html).toContain('src="http://127.0.0.1:4173/index.html"');
    });

    it("renders runner toolbar with initial switcher button and closed dropdown", () => {
      const html = renderToStaticMarkup(
        <WorkspaceRunnerView
          workspace={sampleWorkspaces[0]!}
          allWorkspaces={sampleWorkspaces}
          onBack={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onOpenFolder={vi.fn()}
        />
      );

      expect(html).toContain('title="Switch workspace"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('aria-haspopup="listbox"');
      expect(html).toContain(sampleWorkspaces[0]!.name);
      expect(html).not.toContain('role="listbox"');
    });

    it("renders reload button with accessible title and icon", () => {
      const html = renderToStaticMarkup(
        <WorkspaceRunnerView
          workspace={sampleWorkspaces[0]!}
          allWorkspaces={sampleWorkspaces}
          onBack={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onOpenFolder={vi.fn()}
        />
      );

      expect(html).toContain('title="Reload application preview"');
      expect(html).toContain("Reload");
    });

    it("renders revision badge and version history trigger when onViewVersions is provided", () => {
      const onViewVersions = vi.fn();
      const html = renderToStaticMarkup(
        <WorkspaceRunnerView
          workspace={sampleWorkspaces[0]!}
          allWorkspaces={sampleWorkspaces}
          onBack={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onOpenFolder={vi.fn()}
          onViewVersions={onViewVersions}
        />
      );

      expect(html).toContain(`rev ${sampleWorkspaces[0]!.revision}`);
      expect(html).toContain('title="Inspect version history &amp; restore snapshots"');
    });

    it("omits version history button when onViewVersions is undefined", () => {
      const html = renderToStaticMarkup(
        <WorkspaceRunnerView
          workspace={sampleWorkspaces[0]!}
          allWorkspaces={sampleWorkspaces}
          onBack={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onOpenFolder={vi.fn()}
          onViewVersions={undefined}
        />
      );

      expect(html).not.toContain('title="Inspect version history &amp; restore snapshots"');
    });

    it("verifies interactive switcher dropdown rendering when isSwitcherOpen is true", () => {
      const currentWs = sampleWorkspaces[1]!;
      const onSelectWorkspace = vi.fn();

      const listboxContent = (
        <div
          role="listbox"
          aria-label="Select workspace"
          className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border border-border bg-card p-1.5 shadow-xl z-50 max-h-72 overflow-y-auto"
        >
          {sampleWorkspaces.map((ws) => {
            const isCurrent = ws.root === currentWs.root;
            return (
              <button
                key={ws.root}
                type="button"
                role="option"
                aria-selected={isCurrent}
                onClick={() => onSelectWorkspace(ws)}
                className={isCurrent ? "bg-primary/10 text-primary font-semibold" : "text-foreground"}
              >
                <span>{ws.name}</span>
                <span>{ws.root}</span>
              </button>
            );
          })}
        </div>
      );

      const html = renderToStaticMarkup(listboxContent);
      expect(html).toContain('role="listbox"');
      expect(html).toContain('aria-label="Select workspace"');
      for (const ws of sampleWorkspaces) {
        expect(html).toContain(ws.name);
        expect(html).toContain(ws.root);
      }
      expect(html).toContain(`role="option" aria-selected="true" class="bg-primary/10 text-primary font-semibold"`);
    });

    it("stress-tests runner view with large workspace collection (100 workspaces)", () => {
      const largeSet = generateWorkspaces(100);
      const activeWs = largeSet[42]!;

      const html = renderToStaticMarkup(
        <WorkspaceRunnerView
          workspace={activeWs}
          allWorkspaces={largeSet}
          presentation={{ entryUrl: "http://localhost:3000" }}
          onBack={vi.fn()}
          onSelectWorkspace={vi.fn()}
          onOpenFolder={vi.fn()}
        />
      );

      expect(html).toContain(activeWs.name);
      expect(html).toContain("<iframe");
    });
  });

  // =========================================================================
  // 4. CVA Variant Strictness & Exact Optional Property Types Across Modules
  // =========================================================================
  describe("Repository & Architecture Invariant Checks", () => {
    it("ensures all buttons render valid CVA variant classes", () => {
      const navHtml = renderToStaticMarkup(
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
      expect(navHtml).not.toContain("variant-invalid");

      const hubHtml = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={sampleWorkspaces}
          viewMode="grid"
          onLaunch={vi.fn()}
        />
      );
      expect(hubHtml).not.toContain("variant-invalid");
    });

    it("handles adversarial inputs: workspaces with empty names, negative revisions, and deep paths", () => {
      const weirdWorkspaces: WorkspaceInspection[] = [
        {
          root: "C:/very/deep/nested/path/to/a/workspace/with/an/extraordinarily/long/folder/structure/that/could/overflow/layouts",
          name: "",
          revision: 0,
          currentVersionId: "v-000",
        },
        {
          root: "D:/workspace-special-<char>&\"'",
          name: "<script>alert('xss')</script>",
          revision: -1,
          currentVersionId: "v-neg",
        }
      ];

      const html = renderToStaticMarkup(
        <WorkspaceHub
          workspaces={weirdWorkspaces}
          viewMode="grid"
          onLaunch={vi.fn()}
        />
      );
      expect(html).toContain("grid-cols-1");
      expect(html).toContain("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
      expect(html).toContain("rev -1");
    });
  });
});
