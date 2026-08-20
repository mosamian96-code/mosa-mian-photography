"use client";

import dynamic from "next/dynamic";

// next/dynamic's ssr:false option can only be used from a Client Component -- this
// tiny wrapper exists purely so [...path]/page.tsx (a Server Component) can still
// keep Leaflet out of the server bundle and out of every gallery's initial JS.
const GalleryMap = dynamic(() => import("./gallery-map"), { ssr: false });

export default GalleryMap;
