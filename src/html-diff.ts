import Diff2Html from "diff2html";
import { createTwoFilesPatch } from "diff";
import * as fs from "fs";

export class HtmlDiffClient {
  private htmlOutput: string;

  constructor(lhsPath: string, rhsPath: string) {
    const lhs = fs.readFileSync(lhsPath, "utf8");
    const rhs = fs.readFileSync(rhsPath, "utf8");

    const unifiedDiff = createTwoFilesPatch(lhsPath, rhsPath, lhs, rhs);

    const htmlOutput = Diff2Html.html(unifiedDiff, {
      drawFileList: false,
      outputFormat: "side-by-side",
      matching: "lines",
    });

    // Step 4: Dynamically read CSS file
    const diff2htmlCss = fs.readFileSync(
      "./node_modules/diff2html/bundles/css/diff2html.min.css",
      "utf8"
    );

    // Step 5: Embed CSS into the final HTML
    this.htmlOutput = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Diff View</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
      }
      .d2h-wrapper {
        font-size: 14px;
      }
      /* Inline CSS for diff2html */
      ${diff2htmlCss}
    </style>
  </head>
  <body>
    ${htmlOutput}
  </body>
  </html>`;
  }

  writeOutput(outputPath: string) {
    fs.writeFileSync(outputPath, this.htmlOutput);
  }
}
