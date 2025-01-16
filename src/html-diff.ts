import Diff2Html from "diff2html";
import { createTwoFilesPatch } from "diff";
import * as fs from "fs";

export class HtmlDiffClient {
  private htmlOutput: string;

  constructor(lhsPath: string, rhsPath: string) {
    const lhs = fs.readFileSync(lhsPath, "utf8");
    const rhs = fs.readFileSync(rhsPath, "utf8");

    const unifiedDiff = createTwoFilesPatch(lhsPath, rhsPath, lhs, rhs);

    this.htmlOutput = Diff2Html.html(unifiedDiff, {
      drawFileList: true,
      outputFormat: "side-by-side",
      matching: "lines",
    });
  }

  writeOutput(outputPath: string) {
    fs.writeFileSync(outputPath, this.htmlOutput);
  }
}
