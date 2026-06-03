interface TopAlignedScrollInput {
  containerTop: number;
  currentScrollTop: number;
  targetTop: number;
}

export function getTopAlignedScrollTop(input: TopAlignedScrollInput): number {
  return Math.max(
    0,
    input.currentScrollTop + input.targetTop - input.containerTop,
  );
}

export function scrollElementIntoContainerView(
  container: HTMLElement,
  target: HTMLElement,
): void {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextScrollTop = getTopAlignedScrollTop({
    containerTop: containerRect.top,
    currentScrollTop: container.scrollTop,
    targetTop: targetRect.top,
  });

  container.scrollTo({ behavior: "smooth", top: nextScrollTop });
}
