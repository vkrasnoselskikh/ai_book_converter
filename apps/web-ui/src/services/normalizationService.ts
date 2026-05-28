export class NormalizationService {
  // Strips boundary headers and footers from the page markdown
  static stripBoundaryBlocks(markdownText: string, headers: string[], footers: string[]): string {
    let normalized = markdownText.trim();
    
    for (const h of headers) {
      const trimmedHeader = h.trim();
      if (trimmedHeader && normalized.startsWith(trimmedHeader)) {
        normalized = normalized.substring(trimmedHeader.length).trim();
      }
    }
    
    for (const f of footers) {
      const trimmedFooter = f.trim();
      if (trimmedFooter && normalized.endsWith(trimmedFooter)) {
        normalized = normalized.substring(0, normalized.length - trimmedFooter.length).trim();
      }
    }
    
    return normalized;
  }

  // Ported Python-like fenced code blocks re-indentation
  static normalizeCodeBlocks(markdownText: string): string {
    const pattern = /```([^\n`]*)\n([\s\S]*?)\n```/g;
    return markdownText.replace(pattern, (match, lang, body) => {
      const language = lang.trim();
      if (!this.shouldReindentCodeBlock(language, body)) {
        return match;
      }
      const normalizedBody = this.reindentPythonLikeCode(body);
      return `\`\`\`${language}\n${normalizedBody}\n\`\`\``;
    });
  }

  private static shouldReindentCodeBlock(language: string, body: string): boolean {
    const pythonLikeNames = new Set(["python", "py", "txt", "text"]);
    if (!pythonLikeNames.has(language.toLowerCase())) {
      return false;
    }
    
    const lines = body.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      return false;
    }

    const pythonHints = [
      "def ", "class ", "for ", "while ", "if ", "elif ",
      "else:", "try:", "except", "finally:", "return ", "import ", "from ", "@"
    ];

    return lines.some(line => pythonHints.some(hint => line.startsWith(hint)));
  }

  private static reindentPythonLikeCode(body: string): string {
    const formattedLines: string[] = [];
    let indentLevel = 0;
    let bracketDepth = 0;
    let continuationIndent = 0;
    const dedentPrefixes = ["elif ", "else:", "except", "finally:"];

    const lines = body.split("\n");
    for (const rawLine of lines) {
      const stripped = rawLine.trim();
      if (!stripped) {
        formattedLines.push("");
        continue;
      }

      if (dedentPrefixes.some(prefix => stripped.startsWith(prefix))) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      let currentIndent = indentLevel + continuationIndent;
      if ((")]}").includes(stripped[0]) && continuationIndent > 0) {
        currentIndent = Math.max(0, indentLevel + continuationIndent - 1);
      }

      formattedLines.push("    ".repeat(currentIndent) + stripped);
      
      bracketDepth = Math.max(0, bracketDepth + this.bracketDelta(stripped));
      continuationIndent = bracketDepth > 0 ? 1 : 0;
      
      if (continuationIndent === 0 && stripped.endsWith(":")) {
        indentLevel += 1;
      }
    }

    return formattedLines.join("\n");
  }

  private static bracketDelta(line: string): number {
    let openCount = 0;
    let closeCount = 0;
    for (const char of line) {
      if ("([{".includes(char)) openCount++;
      if (")]}".includes(char)) closeCount++;
    }
    return openCount - closeCount;
  }
}
