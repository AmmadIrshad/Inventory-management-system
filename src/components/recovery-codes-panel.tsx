"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/button";

export function RecoveryCodesPanel({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  function download() {
    const blob = new Blob(
      [`Inventory recovery codes (each works once)\nGenerated ${new Date().toISOString()}\n\n${text}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-gray-700">
        Save these recovery codes somewhere safe, such as a password manager. If you lose your
        phone, each code lets you sign in <strong>once</strong>.{" "}
        <strong>They won&apos;t be shown again.</strong>
      </p>
      <ol className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-sm text-gray-900">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={copy} className={buttonClass("secondary")}>
          {copied ? "Copied" : "Copy codes"}
        </button>
        <button type="button" onClick={download} className={buttonClass("secondary")}>
          Download .txt
        </button>
      </div>
    </div>
  );
}
