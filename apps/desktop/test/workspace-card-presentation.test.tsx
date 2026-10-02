import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceInspection } from "@ai-mo-to/engine";
import { WorkspaceCard } from "../src/components/workspace/card.js";
import { AdaptiveCarousel } from "../src/components/workspace/carousel.js";
import { parsePathBreadcrumbs, WorkspaceBreadcrumbs } from "../src/components/workspace/breadcrumbs.js";

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

describe("WorkspaceCard Presentation & Launch Boundary", () => {
  it("renders hover-mask with centered Launch button and removes Launch from bottom bar", () => {
    const onLaunch = vi.fn();
    const onViewVersions = vi.fn();
    const onDelete = vi.fn();

    const html = renderToStaticMarkup(
      <WorkspaceCard
        workspace={sampleWorkspaces[0]!}
        onLaunch={onLaunch}
        onViewVersions={onViewVersions}
        onDelete={onDelete}
        isActive={true}
      />
    );

    // R1: Hover mask styling present
    expect(html).toContain("opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity");
    expect(html).toContain("bg-black/40");

    // Centered Launch button inside hover mask
    expect(html).toContain('aria-label="Launch Garden Planner"');
    expect(html).toContain("focus-visible:ring-2 focus-visible:ring-ring");
    expect(html).toContain("min-h-[24px]");
    expect(html).toContain("min-w-[24px]");

    // R1: Verify card root does NOT have "group" class so hover/focus on body/footer doesn't reveal thumbnail overlay
    expect(html).not.toMatch(/^<div[^>]*class="[^"]*\bgroup\b[^"]*flex flex-col/);

    // R2: Thumbnail container and title do NOT contain cursor-pointer or title="Launch ..."
    expect(html).not.toContain('title="Launch Garden Planner"');

    // R2: Bottom toolbar has Versions and Delete, but no Launch button
    expect(html).toContain("Versions");
    expect(html).toContain("Delete");

    // R3: Styled breadcrumbs hierarchy instead of monolithic raw text node
    expect(html).toContain("C:");
    expect(html).toContain("workspaces");
    expect(html).toContain("garden-planner");
    expect(html).toContain('title="C:/workspaces/garden-planner"');

    // R4: Streamlined chrome - no rev badge on card surface
    expect(html).not.toMatch(/<span[^>]*class="[^"]*badge[^"]*"[^>]*>\s*rev\s+3\s*<\/span>/i);
    expect(html).toContain("sr-only");
  });

  it("triggers onLaunch strictly via the centered Launch button", () => {
    const onLaunch = vi.fn();
    let cardElement: React.ReactElement | null = null;

    function CardHarness() {
      cardElement = WorkspaceCard({
        workspace: sampleWorkspaces[0]!,
        onLaunch,
        isActive: false
      });
      return cardElement;
    }

    renderToStaticMarkup(<CardHarness />);
    expect(cardElement).not.toBeNull();

    // The top preview container is first child of card
    const cardChildren = React.Children.toArray(cardElement!.props.children) as React.ReactElement[];
    const topThumbnailArea = cardChildren[0]!;
    expect(topThumbnailArea.props.onClick).toBeUndefined(); // Thumbnail container itself has NO onClick

    // The hover overlay is child index 1 of top thumbnail area
    const thumbChildren = React.Children.toArray(topThumbnailArea.props.children) as React.ReactElement[];
    const hoverOverlay = thumbChildren[1]!;
    expect(hoverOverlay.props.onClick).toBeUndefined(); // Hover overlay backdrop has NO onClick

    // The centered Launch button is child of hoverOverlay
    const launchButton = (React.Children.toArray(hoverOverlay.props.children) as React.ReactElement[])[0]!;
    expect(launchButton.props.onClick).toBeDefined();

    // Invoking launch button onClick triggers onLaunch with workspace
    const stopPropagation = vi.fn();
    launchButton.props.onClick({ stopPropagation } as any);
    expect(stopPropagation).toHaveBeenCalled();
    expect(onLaunch).toHaveBeenCalledWith(sampleWorkspaces[0]!);
  });

  it("strictly enforces click boundaries: card body, title, and breadcrumbs never launch", () => {
    const onLaunch = vi.fn();
    let cardElement: React.ReactElement | null = null;

    function CardHarness() {
      cardElement = WorkspaceCard({
        workspace: sampleWorkspaces[0]!,
        onLaunch,
        isActive: false
      });
      return cardElement;
    }

    renderToStaticMarkup(<CardHarness />);
    const cardChildren = React.Children.toArray(cardElement!.props.children) as React.ReactElement[];

    // Root card element has no onClick
    expect((cardElement as any).props.onClick).toBeUndefined();

    // Card body (second child of root) has no onClick
    const cardBody = cardChildren[1]!;
    expect(cardBody.props.onClick).toBeUndefined();

    // Title area inside card body has no onClick
    const bodyChildren = React.Children.toArray(cardBody.props.children) as React.ReactElement[];
    const titleArea = bodyChildren[0]!;
    expect(titleArea.props.onClick).toBeUndefined();

    // Breadcrumb area has no onClick
    const breadcrumbArea = bodyChildren[1]!;
    expect(breadcrumbArea.props.onClick).toBeUndefined();

    expect(onLaunch).not.toHaveBeenCalled();
  });
});

describe("AdaptiveCarousel Presentation & Launch Boundary", () => {
  it("renders centered Launch button on active slide thumbnail canvas and removes bottom Launch button", () => {
    const onLaunchWorkspace = vi.fn();
    const onSelectIndex = vi.fn();

    const html = renderToStaticMarkup(
      <AdaptiveCarousel
        workspaces={sampleWorkspaces}
        selectedIndex={0}
        onSelectIndex={onSelectIndex}
        onLaunchWorkspace={onLaunchWorkspace}
      />
    );

    // R1: Hover mask with centered Launch button on active slide
    expect(html).toContain("opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity");
    expect(html).toContain('aria-label="Launch Garden Planner"');

    // R3: Breadcrumb path in bottom bar with title tooltip retaining full path
    expect(html).toContain('title="C:/workspaces/garden-planner"');
    expect(html).toContain("garden-planner");

    // R4: Streamlined chrome - no upper-right counter badge (e.g. "1 / 2")
    expect(html).not.toMatch(/<span[^>]*class="[^"]*badge[^"]*"[^>]*>\s*1\s*\/\s*2\s*<\/span>/i);
    // No rev badge on slide header surface
    expect(html).not.toMatch(/<span[^>]*class="[^"]*badge[^"]*"[^>]*>\s*rev\s+3\s*<\/span>/i);
  });

  it("strictly navigates and never launches when clicking flanking/inactive slide", () => {
    const onLaunchWorkspace = vi.fn();
    const onSelectIndex = vi.fn();
    let carouselElement: React.ReactElement | null = null;

    function CarouselHarness() {
      carouselElement = AdaptiveCarousel({
        workspaces: sampleWorkspaces,
        selectedIndex: 0,
        onSelectIndex,
        onLaunchWorkspace
      });
      return carouselElement;
    }

    renderToStaticMarkup(<CarouselHarness />);
    expect(carouselElement).not.toBeNull();

    // Stage frame is child index 1 of stageContainer
    const rootChildren = React.Children.toArray(carouselElement!.props.children) as React.ReactElement[];
    const stageContainer = rootChildren[0]!;
    const stageFrame = (React.Children.toArray(stageContainer.props.children) as React.ReactElement[])[1]!;
    const track = (React.Children.toArray(stageFrame.props.children) as React.ReactElement[])[0]!;
    const slides = React.Children.toArray(track.props.children) as React.ReactElement[];

    expect(slides.length).toBe(2);

    // Slide 0 is center (active): clicking slide surface does NOT launch
    slides[0]!.props.onClick();
    expect(onLaunchWorkspace).not.toHaveBeenCalled();
    expect(onSelectIndex).not.toHaveBeenCalled();

    // Slide 1 is inactive: clicking slide surface selects index 1, does NOT launch
    slides[1]!.props.onClick();
    expect(onSelectIndex).toHaveBeenCalledWith(1);
    expect(onLaunchWorkspace).not.toHaveBeenCalled();
  });

  it("strictly enforces that active slide metadata bar and bottom bar do not trigger launch", () => {
    const onLaunchWorkspace = vi.fn();
    const onSelectIndex = vi.fn();
    let carouselElement: React.ReactElement | null = null;

    function CarouselHarness() {
      carouselElement = AdaptiveCarousel({
        workspaces: sampleWorkspaces,
        selectedIndex: 0,
        onSelectIndex,
        onLaunchWorkspace
      });
      return carouselElement;
    }

    renderToStaticMarkup(<CarouselHarness />);
    const rootChildren = React.Children.toArray(carouselElement!.props.children) as React.ReactElement[];
    const stageContainer = rootChildren[0]!;
    const stageFrame = (React.Children.toArray(stageContainer.props.children) as React.ReactElement[])[1]!;
    const track = (React.Children.toArray(stageFrame.props.children) as React.ReactElement[])[0]!;
    const slides = React.Children.toArray(track.props.children) as React.ReactElement[];

    const activeSlide = slides[0]!;
    const slideChildren = React.Children.toArray(activeSlide.props.children) as React.ReactElement[];

    // Top metadata bar (index 0) has no onClick
    expect(slideChildren[0]!.props.onClick).toBeUndefined();

    // Bottom action bar (index 2) has no onClick
    expect(slideChildren[2]!.props.onClick).toBeUndefined();

    expect(onLaunchWorkspace).not.toHaveBeenCalled();
  });
});

describe("WorkspaceBreadcrumbs helper & component", () => {
  it("parses Windows paths into clean breadcrumb segments", () => {
    const segments = parsePathBreadcrumbs("C:\\Users\\User\\workspaces\\garden-planner");
    expect(segments).toEqual(["C:", "…", "workspaces", "garden-planner"]);
  });

  it("parses POSIX paths into clean breadcrumb segments", () => {
    const segments = parsePathBreadcrumbs("/home/user/workspaces/cool-app");
    expect(segments).toEqual(["home", "…", "workspaces", "cool-app"]);
  });

  it("handles short paths without ellipsis", () => {
    const segments = parsePathBreadcrumbs("C:/workspaces/garden-planner");
    expect(segments).toEqual(["C:", "workspaces", "garden-planner"]);
  });

  it("handles empty or degenerate paths gracefully", () => {
    expect(parsePathBreadcrumbs("")).toEqual([]);
    expect(parsePathBreadcrumbs("   ")).toEqual([]);
    expect(parsePathBreadcrumbs("/")).toEqual(["/"]);
    expect(parsePathBreadcrumbs("./")).toEqual([]);
    expect(parsePathBreadcrumbs(".")).toEqual([]);
    expect(parsePathBreadcrumbs("file:///")).toEqual([]);
    expect(parsePathBreadcrumbs("file://")).toEqual([]);
  });

  it("strips file:// schemes and dot-segments cleanly", () => {
    expect(parsePathBreadcrumbs("file:///C:/Users/User/workspaces/garden-planner")).toEqual([
      "C:",
      "…",
      "workspaces",
      "garden-planner"
    ]);
    expect(parsePathBreadcrumbs("file:///home/user/workspaces/cool-app")).toEqual([
      "home",
      "…",
      "workspaces",
      "cool-app"
    ]);
    expect(parsePathBreadcrumbs("C:/workspaces/./garden-planner")).toEqual([
      "C:",
      "workspaces",
      "garden-planner"
    ]);
  });

  it("parses Windows UNC network paths into unified share root breadcrumbs", () => {
    // 2 segments: \\server\share
    expect(parsePathBreadcrumbs("\\\\server\\share")).toEqual(["\\\\server\\share"]);
    // 3 segments: \\server\share > app
    expect(parsePathBreadcrumbs("\\\\server\\share\\app")).toEqual(["\\\\server\\share", "app"]);
    // 4 segments: \\server\share > projects > app
    expect(parsePathBreadcrumbs("\\\\server\\share\\projects\\app")).toEqual([
      "\\\\server\\share",
      "projects",
      "app"
    ]);
    // 5 segments (ellipsized): \\server\share > … > workspaces > garden-planner
    expect(parsePathBreadcrumbs("\\\\server\\share\\users\\user\\workspaces\\garden-planner")).toEqual([
      "\\\\server\\share",
      "…",
      "workspaces",
      "garden-planner"
    ]);
  });

  it("strips Windows extended-length prefixes (\\\\?\\ and \\\\?\\UNC\\) cleanly", () => {
    expect(parsePathBreadcrumbs("\\\\?\\C:\\workspaces\\garden-planner")).toEqual([
      "C:",
      "workspaces",
      "garden-planner"
    ]);
    expect(parsePathBreadcrumbs("\\\\?\\C:\\Users\\User\\workspaces\\garden-planner")).toEqual([
      "C:",
      "…",
      "workspaces",
      "garden-planner"
    ]);
    expect(parsePathBreadcrumbs("\\\\?\\UNC\\server\\share\\projects\\app")).toEqual([
      "\\\\server\\share",
      "projects",
      "app"
    ]);
  });

  it("renders breadcrumb trail with full title tooltip and aria-current", () => {
    const html = renderToStaticMarkup(
      <WorkspaceBreadcrumbs path="C:/workspaces/garden-planner" />
    );
    expect(html).toContain('title="C:/workspaces/garden-planner"');
    expect(html).toContain("C:");
    expect(html).toContain("workspaces");
    expect(html).toContain("garden-planner");
    expect(html).toContain("<nav");
    expect(html).toContain('aria-current="location"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("returns null for empty, whitespace, or degenerate paths", () => {
    expect(renderToStaticMarkup(<WorkspaceBreadcrumbs path="" />)).toBe("");
    expect(renderToStaticMarkup(<WorkspaceBreadcrumbs path="   " />)).toBe("");
    expect(renderToStaticMarkup(<WorkspaceBreadcrumbs path="file:///" />)).toBe("");
    expect(renderToStaticMarkup(<WorkspaceBreadcrumbs path="./" />)).toBe("");
  });
});
