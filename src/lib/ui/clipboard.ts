export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard?.writeText(text);
    if (navigator.clipboard) return true;
  } catch {
    // Fall back below for browsers that block Clipboard API on local HTTP.
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.top = "-9999px";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textArea);
    return copied;
  } catch {
    return false;
  }
}
