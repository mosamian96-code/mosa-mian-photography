"use client";

import { UploadDropzone } from "./upload-dropzone";

export default function UploadPage() {
  return (
    <div>
      <h1 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">Upload</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Drag a folder in, or pick one. RAW, JPEG, HEIC, and .xmp sidecars are recognized; anything
        else is skipped. Re-dropping a folder you already imported costs nothing — matching files
        are detected by content and never re-uploaded. To attach photos to a gallery as they
        upload, drop them onto that gallery&rsquo;s own page instead — anything uploaded from here
        has no destination and no browsing page to find it again later.
      </p>

      <div className="mt-6">
        <UploadDropzone />
      </div>
    </div>
  );
}
