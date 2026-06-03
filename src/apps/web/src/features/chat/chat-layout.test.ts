import { describe, expect, it } from "vitest";

import {
  chatComposerGridClassName,
  chatCitationScrollContentClassName,
  chatCitationScrollClassName,
  chatPanelHeaderClassName,
  chatLayoutGridClassName,
  chatMessagesFrameClassName,
  chatMessageScrollContentClassName,
  chatMessageScrollClassName,
  chatModeSelectClassName,
  chatModeSelectPlacement,
  chatPanelClassName,
  chatSessionScrollClassName,
  chatSubmitButtonClassName,
  chatTextareaClassName,
} from "./chat-layout";

describe("chat layout", () => {
  it("keeps the answer column dominant on desktop while retaining side panels", () => {
    const className = chatLayoutGridClassName();

    expect(className).toContain("xl:h-[calc(100vh-121px)]");
    expect(className).not.toContain("xl:min-h-[calc(100vh-121px)]");
    expect(className).toContain("xl:grid-cols-[240px_minmax(520px,1fr)_300px]");
    expect(className).toContain("xl:items-stretch");
  });

  it("keeps session, answer, and citation panel headers vertically aligned", () => {
    const className = chatPanelHeaderClassName();

    expect(className).toContain("min-h-[137px]");
    expect(className).toContain("xl:min-h-[137px]");
  });

  it("lets side panel scroll regions fill the height left after aligned headers", () => {
    expect(chatPanelClassName()).toContain("flex");
    expect(chatPanelClassName()).toContain("h-full");
    expect(chatPanelClassName()).not.toContain("min-h-[640px]");
    expect(chatPanelClassName()).toContain("flex-col");
    expect(chatPanelClassName()).toContain("gap-0");
    expect(chatPanelClassName()).toContain("pb-0");
    expect(chatSessionScrollClassName()).toContain("flex-1");
    expect(chatCitationScrollClassName()).toContain("flex-1");
  });

  it("keeps the conversation scrollable inside a stable frame", () => {
    const className = chatMessagesFrameClassName();

    expect(className).toContain("min-h-0");
    expect(className).toContain("flex-1");
    expect(className).toContain("overflow-hidden");
  });

  it("keeps chat and citation scroll content visually aligned after scrollbar padding", () => {
    expect(chatMessageScrollClassName()).toContain("flex-1");
    expect(chatMessageScrollClassName()).not.toContain("space-y-4");
    expect(chatMessageScrollContentClassName()).toContain("space-y-4");
    expect(chatMessageScrollContentClassName()).toContain("pl-4");
    expect(chatMessageScrollContentClassName()).toContain("pr-4");
    expect(chatMessageScrollContentClassName()).not.toContain("p-4");

    expect(chatCitationScrollClassName()).toContain("flex-1");
    expect(chatCitationScrollClassName()).not.toContain("space-y-4");
    expect(chatCitationScrollContentClassName()).toContain("space-y-4");
    expect(chatCitationScrollContentClassName()).toContain("pl-4");
    expect(chatCitationScrollContentClassName()).toContain("pr-4");
    expect(chatCitationScrollContentClassName()).not.toContain("p-4");
  });

  it("uses a responsive composer with a multiline question input", () => {
    expect(chatComposerGridClassName()).toContain("items-stretch");
    expect(chatComposerGridClassName()).toContain("lg:grid-cols-[180px_minmax(0,1fr)_136px]");
    expect(chatModeSelectClassName()).toContain("[&>button]:h-14");
    expect(chatModeSelectPlacement()).toBe("top");
    expect(chatTextareaClassName()).toContain("h-14");
    expect(chatTextareaClassName()).toContain("min-h-[56px]");
    expect(chatTextareaClassName()).toContain("resize-none");
    expect(chatSubmitButtonClassName()).toContain("h-14");
    expect(chatSubmitButtonClassName()).toContain("min-h-[56px]");
    expect(chatSubmitButtonClassName()).toContain("py-0");
    expect(chatSubmitButtonClassName()).toContain("lg:w-full");
  });
});
