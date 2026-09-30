export function fitRotatedVideo(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
  angle: number,
) {
  if (width <= 0 || height <= 0 || availableWidth <= 0 || availableHeight <= 0) return undefined;
  const quarterTurn = angle % 180 !== 0;
  const scale = Math.min(
    availableWidth / (quarterTurn ? height : width),
    availableHeight / (quarterTurn ? width : height),
  );
  return { width: width * scale, height: height * scale };
}
