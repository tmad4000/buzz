/** ASCII clipboard fixtures use the same generated text in either flavor. */
export function syntheticComposerPaste(bytes: number) {
  const line = "Generated-Paseo-fixture-".repeat(6);
  const ending = "paste-end!";
  const body = `${line}\n`
    .repeat(Math.ceil(bytes / line.length))
    .slice(0, bytes - ending.length);
  const text = `${body}${ending}`;
  const lines = text.split("\n");
  const html = lines
    .map((row, index) =>
      index === lines.length - 1
        ? `<p><strong>${row}</strong></p>`
        : `<p>${row}</p>`,
    )
    .join("");

  return { text, html };
}
