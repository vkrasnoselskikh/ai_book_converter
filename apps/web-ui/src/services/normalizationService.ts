import { spawn } from "node:child_process";
import * as prettier from "prettier";

type FormatterCommandRunner = (
  command: string,
  args: string[],
  input: string,
) => Promise<string>;

export class NormalizationService {
  private static formatterCommandRunner: FormatterCommandRunner =
    NormalizationService.runFormatterCommand;

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

  static async normalizeCodeBlocks(markdownText: string): Promise<string> {
    const codeBlockPattern = /```([^\n`]*)\n([\s\S]*?)\n```/g;
    const parts: string[] = [];
    let cursor = 0;

    for (const match of markdownText.matchAll(codeBlockPattern)) {
      const matchIndex = match.index ?? 0;
      const fullBlock = match[0];
      const info = match[1] ?? "";
      const code = match[2] ?? "";

      parts.push(markdownText.slice(cursor, matchIndex));
      const formattedCode = await this.formatCodeBlock(info, code);
      parts.push(`\`\`\`${info}\n${formattedCode.trimEnd()}\n\`\`\``);
      cursor = matchIndex + fullBlock.length;
    }

    parts.push(markdownText.slice(cursor));
    return parts.join("");
  }

  static setFormatterCommandRunnerForTests(
    runner: FormatterCommandRunner | null,
  ): void {
    this.formatterCommandRunner = runner ?? this.runFormatterCommand;
  }

  private static async formatCodeBlock(
    info: string,
    code: string,
  ): Promise<string> {
    const language = this.extractLanguage(info);
    try {
      if (language === "python" || language === "py") {
        return await this.formatWithRuff(code);
      }

      const parser = this.prettierParserForLanguage(language);
      if (parser) {
        return await prettier.format(code, { parser });
      }
    } catch {
      return code;
    }

    return code;
  }

  private static extractLanguage(info: string): string {
    return info.trim().split(/\s+/)[0]?.toLowerCase() || "";
  }

  private static prettierParserForLanguage(language: string): string | null {
    const parsers: Record<string, string> = {
      css: "css",
      javascript: "babel",
      js: "babel",
      markdown: "markdown",
      md: "markdown",
      ts: "typescript",
      typescript: "typescript",
    };

    return parsers[language] || null;
  }

  private static formatWithRuff(code: string): Promise<string> {
    return this.formatterCommandRunner(
      "ruff",
      ["format", "--stdin-filename", "code.py", "-"],
      code,
    );
  }

  private static runFormatterCommand(
    command: string,
    args: string[],
    input: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
      const chunks: Buffer[] = [];
      const errorChunks: Buffer[] = [];
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`${command} formatter timed out`));
      }, 5000);

      child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => errorChunks.push(chunk));
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve(Buffer.concat(chunks).toString("utf-8"));
          return;
        }
        const message = Buffer.concat(errorChunks).toString("utf-8");
        reject(new Error(message || `${command} exited with code ${code}`));
      });

      child.stdin.end(input);
    });
  }
}
