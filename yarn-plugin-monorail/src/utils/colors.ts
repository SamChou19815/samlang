const coloredTerminalSection = (colorID: number): ColoredSectionFunction => {
  if (!process.stderr.isTTY) return (content) => content;
  return (content) => `\u001b[${colorID}m${content}\u001b[0m`;
};

type ColoredSectionFunction = (content: string) => string;

export const RED: ColoredSectionFunction = coloredTerminalSection(31);
export const GREEN: ColoredSectionFunction = coloredTerminalSection(32);
export const YELLOW: ColoredSectionFunction = coloredTerminalSection(33);
export const BLUE: ColoredSectionFunction = coloredTerminalSection(34);
export const MAGENTA: ColoredSectionFunction = coloredTerminalSection(35);
export const CYAN: ColoredSectionFunction = coloredTerminalSection(36);
